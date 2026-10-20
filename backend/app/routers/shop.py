"""Shop: browse cosmetics, buy them with coins, equip what you own."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ..auth import get_current_profile, profile_payload
from ..database import get_db, select_for_update
from ..economy import apply_rewards
from ..models import Profile, Purchase, ShopItem
from ..schemas import ProfileOut, ShopOut

router = APIRouter(prefix="/shop", tags=["shop"])

VALID_KINDS = ("theme", "avatar")


def shop_payload(db: Session, profile: Profile, kind: str | None = None) -> dict:
    """Build the shop listing for one user (ownership + equipped flags)."""
    query = db.query(ShopItem)
    if kind in VALID_KINDS:
        query = query.filter(ShopItem.kind == kind)
    items = query.order_by(ShopItem.kind.asc(), ShopItem.sort_order.asc(), ShopItem.price.asc()).all()

    owned = {purchase.item_slug for purchase in profile.purchases}
    payload = []
    for item in items:
        equipped = profile.theme_slug == item.slug if item.kind == "theme" else profile.avatar_slug == item.slug
        payload.append(
            {
                "slug": item.slug,
                "name": item.name,
                "kind": item.kind,
                "description": item.description,
                "price": item.price,
                "rarity": item.rarity,
                "is_free": item.is_free,
                "meta": item.meta or {},
                "owned": item.is_free or item.slug in owned,
                "equipped": equipped,
            }
        )

    return {"items": payload, "coins": profile.coins}


@router.get("", response_model=ShopOut)
def list_shop(
    kind: str | None = Query(default=None, pattern="^(theme|avatar)$"),
    profile: Profile = Depends(get_current_profile),
    db: Session = Depends(get_db),
) -> dict:
    return shop_payload(db, profile, kind)


@router.post("/{slug}/buy", response_model=ShopOut)
def buy_item(
    slug: str,
    profile: Profile = Depends(get_current_profile),
    db: Session = Depends(get_db),
) -> dict:
    item = db.get(ShopItem, slug)
    if not item:
        raise HTTPException(status_code=404, detail="That item is not in the shop.")

    if item.is_free or any(purchase.item_slug == slug for purchase in profile.purchases):
        raise HTTPException(status_code=400, detail="You already own this item.")

    # Lock the wallet row so two taps cannot overspend the same coins.
    locked = select_for_update(db.query(Profile).filter(Profile.id == profile.id), db).one()
    if locked.coins < item.price:
        raise HTTPException(
            status_code=400,
            detail=f"You need {item.price - locked.coins} more coins to unlock {item.name}.",
        )

    apply_rewards(db, locked, coins=-item.price, reason=f"Unlocked {item.name}")
    db.add(Purchase(user_id=locked.id, item_slug=slug, price_paid=item.price))

    # Cosmetics are auto-equipped the moment they are bought.
    if item.kind == "theme":
        locked.theme_slug = slug
    else:
        locked.avatar_slug = slug

    db.commit()
    db.refresh(locked)
    return shop_payload(db, locked)


@router.post("/{slug}/equip", response_model=ProfileOut)
def equip_item(
    slug: str,
    profile: Profile = Depends(get_current_profile),
    db: Session = Depends(get_db),
) -> dict:
    """Equip an owned (or free) cosmetic and return the updated profile."""
    item = db.get(ShopItem, slug)
    if not item:
        raise HTTPException(status_code=404, detail="That item is not in the shop.")

    owned = item.is_free or any(purchase.item_slug == slug for purchase in profile.purchases)
    if not owned:
        raise HTTPException(status_code=403, detail="You do not own this item yet.")

    if item.kind == "theme":
        profile.theme_slug = slug
    else:
        profile.avatar_slug = slug

    db.commit()
    db.refresh(profile)
    return profile_payload(profile)
