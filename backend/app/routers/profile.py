"""Profile, onboarding, cosmetics and ledger endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from sqlalchemy.orm import Session

from ..auth import get_current_profile, profile_payload
from ..config import settings
from ..database import get_db, select_for_update
from ..economy import (
    AVATAR_CHANGE_COST,
    COINS_PER_TASK,
    LATE_ELO_MAX,
    LATE_ELO_MIN,
    ON_TIME_ELO_MAX,
    ON_TIME_ELO_MIN,
    ON_TIME_WINDOW_MINUTES,
    PERFECT_ROUTINE_COINS,
    USERNAME_CHANGE_COST,
    apply_rewards,
    rank_for,
)
from ..models import LedgerEntry, Profile, Proof, ShopItem
from ..schemas import CosmeticRequest, LedgerOut, ProfileOut, UsernameRequest
from ..serializers import serialize_proof
from ..services.storage import delete_upload_image, save_avatar_image

router = APIRouter(tags=["profile"])


def _equip(db: Session, profile: Profile, slug: str, expected_kind: str) -> dict:
    item = db.get(ShopItem, slug)
    if not item or item.kind != expected_kind:
        raise HTTPException(status_code=404, detail="That cosmetic does not exist.")

    purchased = any(p.item_slug == slug for p in profile.purchases)
    if not item.is_free and not purchased:
        raise HTTPException(status_code=403, detail="You do not own this item yet.")

    if expected_kind == "theme":
        profile.theme_slug = slug
    else:
        profile.avatar_slug = slug
    db.commit()
    db.refresh(profile)
    return profile_payload(profile)


@router.get("/me", response_model=ProfileOut)
def read_me(profile: Profile = Depends(get_current_profile)) -> dict:
    return profile_payload(profile)


@router.get("/me/ledger", response_model=list[LedgerOut])
def read_ledger(
    limit: int = Query(default=25, ge=1, le=100),
    profile: Profile = Depends(get_current_profile),
    db: Session = Depends(get_db),
) -> list[LedgerEntry]:
    return (
        db.query(LedgerEntry)
        .filter(LedgerEntry.user_id == profile.id)
        .order_by(LedgerEntry.created_at.desc(), LedgerEntry.id.desc())
        .limit(limit)
        .all()
    )


@router.get("/me/proofs")
def read_my_proofs(
    limit: int = Query(default=20, ge=1, le=100),
    profile: Profile = Depends(get_current_profile),
    db: Session = Depends(get_db),
) -> list[dict]:
    proofs = (
        db.query(Proof)
        .filter(Proof.user_id == profile.id)
        .order_by(Proof.created_at.desc())
        .limit(limit)
        .all()
    )
    return [serialize_proof(db, proof) for proof in proofs]


@router.get("/usernames/available")
def username_available(username: str = Query(min_length=3, max_length=20), db: Session = Depends(get_db)) -> dict:
    payload = UsernameRequest(username=username)
    taken = db.query(Profile.id).filter(Profile.username == payload.username).first() is not None
    return {"username": payload.username, "available": not taken}


@router.post("/me/username", response_model=ProfileOut)
def set_username(
    payload: UsernameRequest,
    profile: Profile = Depends(get_current_profile),
    db: Session = Depends(get_db),
) -> dict:
    """First username is free, every change after that costs coins."""
    db.refresh(profile)

    if payload.username == profile.username:
        return profile_payload(profile)

    taken = (
        db.query(Profile.id)
        .filter(Profile.username == payload.username, Profile.id != profile.id)
        .first()
    )
    if taken:
        raise HTTPException(status_code=409, detail="That username is already taken.")

    is_first_time = profile.username is None
    if not is_first_time:
        if profile.coins < USERNAME_CHANGE_COST:
            raise HTTPException(
                status_code=400,
                detail=f"Changing your username costs {USERNAME_CHANGE_COST} coins. You have {profile.coins}.",
            )
        apply_rewards(db, profile, coins=-USERNAME_CHANGE_COST, reason="Username change")
        profile.username_changes = (profile.username_changes or 0) + 1

    profile.username = payload.username
    db.commit()
    db.refresh(profile)
    return profile_payload(profile)


@router.post("/me/avatar/upload", response_model=ProfileOut)
async def upload_avatar(
    file: UploadFile = File(...),
    profile: Profile = Depends(get_current_profile),
    db: Session = Depends(get_db),
) -> dict:
    """Upload a custom profile picture. Each change costs coins."""
    if profile.coins < AVATAR_CHANGE_COST:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Changing your profile picture costs {AVATAR_CHANGE_COST} coins. "
                f"You have {profile.coins}."
            ),
        )

    limit = settings.max_upload_bytes if settings.max_upload_bytes > 0 else 8 * 1024 * 1024
    data = await file.read(limit + 1)
    try:
        avatar_path, _ = save_avatar_image(data, profile.id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    locked = select_for_update(db.query(Profile).filter(Profile.id == profile.id), db).one()
    if locked.coins < AVATAR_CHANGE_COST:
        delete_upload_image(avatar_path)
        raise HTTPException(
            status_code=400,
            detail=(
                f"Changing your profile picture costs {AVATAR_CHANGE_COST} coins. "
                f"You have {locked.coins}."
            ),
        )

    previous_path = locked.avatar_path
    apply_rewards(
        db,
        locked,
        coins=-AVATAR_CHANGE_COST,
        reason="Profile picture change",
    )
    locked.avatar_path = avatar_path
    db.commit()
    db.refresh(locked)

    if previous_path and previous_path != avatar_path:
        delete_upload_image(previous_path)

    return profile_payload(locked)


@router.post("/me/avatar", response_model=ProfileOut)
def set_avatar(
    payload: CosmeticRequest,
    profile: Profile = Depends(get_current_profile),
    db: Session = Depends(get_db),
) -> dict:
    return _equip(db, profile, payload.slug, "avatar")


@router.post("/me/theme", response_model=ProfileOut)
def set_theme(
    payload: CosmeticRequest,
    profile: Profile = Depends(get_current_profile),
    db: Session = Depends(get_db),
) -> dict:
    return _equip(db, profile, payload.slug, "theme")


@router.get("/config")
def read_config() -> dict:
    """Public bootstrap config so the frontend can configure Supabase itself."""
    return {
        "app_name": settings.app_name,
        "environment": settings.environment,
        "supabase_url": settings.supabase_url,
        "supabase_anon_key": settings.supabase_public_key,
        "supabase_configured": settings.supabase_configured,
        "dev_auth": settings.dev_auth_enabled,
        "ranks": [
            {
                "name": rank.name,
                "min_elo": rank.min_elo,
                "max_elo": rank.max_elo,
                "color": rank.color,
                "progress": rank.progress,
                "elo_to_next": rank.elo_to_next,
            }
            for rank in (rank_for(elo) for elo in (100, 500, 800, 1200, 1600, 2000))
        ],
        "economics": {
            "coins_per_task": COINS_PER_TASK,
            "perfect_routine_coins": PERFECT_ROUTINE_COINS,
            "on_time_window_minutes": ON_TIME_WINDOW_MINUTES,
            "on_time_elo_min": ON_TIME_ELO_MIN,
            "on_time_elo_max": ON_TIME_ELO_MAX,
            "late_elo_min": LATE_ELO_MIN,
            "late_elo_max": LATE_ELO_MAX,
            "username_change_cost": USERNAME_CHANGE_COST,
        },
    }
