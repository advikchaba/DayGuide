"""Administrator dashboard API.

Every route is protected by :func:`require_admin` on the server. The frontend
route guard is only a convenience; hiding a button never grants access here.
"""

from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from ..auth import is_admin_profile, profile_payload, require_admin
from ..catalog import DEFAULT_AVATAR, DEFAULT_THEME
from ..database import get_db, select_for_update
from ..models import LedgerEntry, Profile, Purchase, Routine, ShopItem, Task
from ..schemas import (
    AdminCoinSetRequest,
    AdminDeleteUserRequest,
    AdminEloSetRequest,
    AdminGrantRequest,
    RoutineUpdate,
    TaskIn,
)
from ..serializers import serialize_routine
from ..services.accounts import (
    AccountDeletionError,
    delete_supabase_identity,
    mark_account_deleted,
    purge_local_account,
)
from ..services.routines import ensure_task_spacing, get_owned_routine, get_owned_task
from ..services.storage import delete_upload_image, public_url
from .reports import PeriodKey, build_report
from .shop import shop_payload

router = APIRouter(prefix="/admin", tags=["admin"])


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #
def _target_profile(db: Session, user_id: str) -> Profile:
    profile = db.get(Profile, user_id)
    if not profile:
        raise HTTPException(status_code=404, detail="User not found.")
    return profile


def _audit_reason(action: str, admin: Profile) -> str:
    return f"{action} by {admin.email}"[:120]


def _user_summary(
    profile: Profile,
    *,
    routines_count: int = 0,
    tasks_count: int = 0,
) -> dict:
    return {
        "id": profile.id,
        "email": profile.email,
        "username": profile.username,
        "coins": profile.coins,
        "elo": profile.elo,
        "avatar_slug": profile.avatar_slug,
        "avatar_url": public_url(profile.avatar_path) if profile.avatar_path else None,
        "created_at": profile.created_at.isoformat(),
        "streak": profile.streak,
        "best_streak": profile.best_streak,
        "routines_count": routines_count,
        "tasks_count": tasks_count,
        "is_admin": is_admin_profile(profile),
    }


def _counts_for(db: Session, user_ids: list[str]) -> tuple[dict[str, int], dict[str, int]]:
    if not user_ids:
        return {}, {}
    routine_counts = dict(
        db.query(Routine.user_id, func.count(Routine.id))
        .filter(Routine.user_id.in_(user_ids))
        .group_by(Routine.user_id)
        .all()
    )
    task_counts = dict(
        db.query(Routine.user_id, func.count(Task.id))
        .join(Task, Task.routine_id == Routine.id)
        .filter(Routine.user_id.in_(user_ids))
        .group_by(Routine.user_id)
        .all()
    )
    return routine_counts, task_counts


def _routine_payload(
    db: Session,
    routine: Routine,
    user_id: str,
    day: date | None = None,
) -> dict:
    return serialize_routine(db, routine, user_id, day)


def _shop_items(db: Session, profile: Profile) -> list[dict]:
    return shop_payload(db, profile)["items"]


def _purchases(db: Session, profile: Profile) -> list[dict]:
    rows = (
        db.query(Purchase, ShopItem)
        .join(ShopItem, ShopItem.slug == Purchase.item_slug)
        .filter(Purchase.user_id == profile.id)
        .order_by(Purchase.created_at.desc())
        .all()
    )
    return [
        {
            "slug": item.slug,
            "name": item.name,
            "kind": item.kind,
            "price_paid": purchase.price_paid,
            "created_at": purchase.created_at.isoformat(),
            "equipped": (
                profile.theme_slug == item.slug
                if item.kind == "theme"
                else profile.avatar_slug == item.slug
            ),
        }
        for purchase, item in rows
    ]


def _ledger(db: Session, profile: Profile, limit: int = 20) -> list[dict]:
    rows = (
        db.query(LedgerEntry)
        .filter(LedgerEntry.user_id == profile.id)
        .order_by(LedgerEntry.created_at.desc(), LedgerEntry.id.desc())
        .limit(limit)
        .all()
    )
    return [
        {
            "id": row.id,
            "delta": row.delta,
            "elo_delta": row.elo_delta,
            "reason": row.reason,
            "created_at": row.created_at.isoformat(),
        }
        for row in rows
    ]


# --------------------------------------------------------------------------- #
# Users
# --------------------------------------------------------------------------- #
@router.get("/users")
def list_users(
    q: str = Query(default="", max_length=120),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=1, le=100),
    _admin: Profile = Depends(require_admin),
    db: Session = Depends(get_db),
) -> dict:
    query = db.query(Profile)
    search = q.strip()
    if search:
        pattern = f"%{search}%"
        query = query.filter(
            or_(
                Profile.email.ilike(pattern),
                Profile.username.ilike(pattern),
                Profile.id.ilike(pattern),
            )
        )

    total = query.count()
    profiles = (
        query.order_by(Profile.created_at.desc(), Profile.id.asc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    ids = [profile.id for profile in profiles]
    routine_counts, task_counts = _counts_for(db, ids)

    return {
        "items": [
            _user_summary(
                profile,
                routines_count=routine_counts.get(profile.id, 0),
                tasks_count=task_counts.get(profile.id, 0),
            )
            for profile in profiles
        ],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@router.get("/users/{user_id}")
def read_user(
    user_id: str,
    local_date: date | None = Query(default=None),
    _admin: Profile = Depends(require_admin),
    db: Session = Depends(get_db),
) -> dict:
    profile = _target_profile(db, user_id)
    day = local_date or date.today()
    routines = (
        db.query(Routine)
        .filter(Routine.user_id == profile.id)
        .order_by(Routine.created_at.asc(), Routine.id.asc())
        .all()
    )
    routine_counts, task_counts = _counts_for(db, [profile.id])

    return {
        "user": {
            **_user_summary(
                profile,
                routines_count=routine_counts.get(profile.id, 0),
                tasks_count=task_counts.get(profile.id, 0),
            ),
            **profile_payload(profile),
        },
        "routines": [
            _routine_payload(db, routine, profile.id, day) for routine in routines
        ],
        "shop": _shop_items(db, profile),
        "purchases": _purchases(db, profile),
        "ledger": _ledger(db, profile),
        "local_date": day.isoformat(),
    }


@router.delete("/users/{user_id}")
def delete_user(
    user_id: str,
    payload: AdminDeleteUserRequest,
    admin: Profile = Depends(require_admin),
    db: Session = Depends(get_db),
) -> dict:
    profile = _target_profile(db, user_id)
    if payload.confirm_email.strip().lower() != profile.email.lower():
        raise HTTPException(
            status_code=400,
            detail="Type the account's full email address to confirm deletion.",
        )

    email = profile.email
    try:
        # Remove the sign-in identity first. Without this, Supabase would keep
        # the email reserved and the person could not create a new account.
        delete_supabase_identity(profile.id)
        # Tombstone the old auth id before touching local rows, so a failure
        # halfway through the purge cannot leave a usable profile behind.
        mark_account_deleted(db, profile)
        image_paths = purge_local_account(db, profile)
    except AccountDeletionError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc

    for path in image_paths:
        delete_upload_image(path)

    return {
        "deleted": True,
        "user_id": user_id,
        "email": email,
        "deleted_by": admin.email,
    }


# --------------------------------------------------------------------------- #
# Coins and ELO
# --------------------------------------------------------------------------- #
@router.post("/users/{user_id}/coins/grant")
def grant_coins(
    user_id: str,
    payload: AdminGrantRequest,
    admin: Profile = Depends(require_admin),
    db: Session = Depends(get_db),
) -> dict:
    _target_profile(db, user_id)
    profile = select_for_update(db.query(Profile).filter(Profile.id == user_id), db).one()
    profile.coins += payload.amount
    db.add(
        LedgerEntry(
            user_id=profile.id,
            delta=payload.amount,
            reason=_audit_reason(f"Admin coin grant ({payload.amount})", admin),
        )
    )
    db.commit()
    db.refresh(profile)
    return {
        "user": _user_summary(profile),
        "applied": {"coins": payload.amount, "balance": profile.coins},
    }


@router.post("/users/{user_id}/coins/set")
def set_coins(
    user_id: str,
    payload: AdminCoinSetRequest,
    admin: Profile = Depends(require_admin),
    db: Session = Depends(get_db),
) -> dict:
    _target_profile(db, user_id)
    profile = select_for_update(db.query(Profile).filter(Profile.id == user_id), db).one()
    delta = payload.amount - profile.coins
    profile.coins = payload.amount
    if delta:
        db.add(
            LedgerEntry(
                user_id=profile.id,
                delta=delta,
                reason=_audit_reason(f"Admin set coins to {payload.amount}", admin),
            )
        )
    db.commit()
    db.refresh(profile)
    return {
        "user": _user_summary(profile),
        "applied": {"coins": delta, "balance": profile.coins},
    }


@router.post("/users/{user_id}/elo/grant")
def grant_elo(
    user_id: str,
    payload: AdminGrantRequest,
    admin: Profile = Depends(require_admin),
    db: Session = Depends(get_db),
) -> dict:
    _target_profile(db, user_id)
    profile = select_for_update(db.query(Profile).filter(Profile.id == user_id), db).one()
    profile.elo += payload.amount
    db.add(
        LedgerEntry(
            user_id=profile.id,
            elo_delta=payload.amount,
            reason=_audit_reason(f"Admin ELO grant ({payload.amount})", admin),
        )
    )
    db.commit()
    db.refresh(profile)
    return {
        "user": _user_summary(profile),
        "applied": {"elo": payload.amount, "balance": profile.elo},
    }


@router.post("/users/{user_id}/elo/set")
def set_elo(
    user_id: str,
    payload: AdminEloSetRequest,
    admin: Profile = Depends(require_admin),
    db: Session = Depends(get_db),
) -> dict:
    _target_profile(db, user_id)
    profile = select_for_update(db.query(Profile).filter(Profile.id == user_id), db).one()
    delta = payload.amount - profile.elo
    profile.elo = payload.amount
    if delta:
        db.add(
            LedgerEntry(
                user_id=profile.id,
                elo_delta=delta,
                reason=_audit_reason(f"Admin set ELO to {payload.amount}", admin),
            )
        )
    db.commit()
    db.refresh(profile)
    return {
        "user": _user_summary(profile),
        "applied": {"elo": delta, "balance": profile.elo},
    }


# --------------------------------------------------------------------------- #
# Reports and routines
# --------------------------------------------------------------------------- #
@router.get("/users/{user_id}/reports")
def read_user_report(
    user_id: str,
    period: PeriodKey = Query(default="week", alias="range"),
    local_date: date | None = Query(default=None),
    _admin: Profile = Depends(require_admin),
    db: Session = Depends(get_db),
) -> dict:
    profile = _target_profile(db, user_id)
    return build_report(db, profile, period, local_date)


@router.patch("/users/{user_id}/routines/{routine_id}")
def update_user_routine(
    user_id: str,
    routine_id: int,
    payload: RoutineUpdate,
    _admin: Profile = Depends(require_admin),
    db: Session = Depends(get_db),
) -> dict:
    profile = _target_profile(db, user_id)
    routine = get_owned_routine(db, routine_id, profile.id)
    if payload.name is not None:
        routine.name = payload.name.strip()
    if payload.emoji is not None:
        routine.emoji = payload.emoji
    db.commit()
    db.refresh(routine)
    return _routine_payload(db, routine, profile.id)


@router.delete("/users/{user_id}/routines/{routine_id}")
def delete_user_routine(
    user_id: str,
    routine_id: int,
    _admin: Profile = Depends(require_admin),
    db: Session = Depends(get_db),
) -> dict:
    profile = _target_profile(db, user_id)
    routine = get_owned_routine(db, routine_id, profile.id)
    db.delete(routine)
    db.commit()
    return {"deleted": True, "routine_id": routine_id}


@router.post(
    "/users/{user_id}/routines/{routine_id}/tasks",
    status_code=status.HTTP_201_CREATED,
)
def add_user_task(
    user_id: str,
    routine_id: int,
    payload: TaskIn,
    _admin: Profile = Depends(require_admin),
    db: Session = Depends(get_db),
) -> dict:
    profile = _target_profile(db, user_id)
    routine = get_owned_routine(db, routine_id, profile.id)
    ensure_task_spacing(db, profile.id, [payload], routine_id=routine.id)
    position = max((task.position for task in routine.tasks), default=-1) + 1
    db.add(
        Task(
            routine_id=routine.id,
            title=payload.title.strip(),
            note=payload.note,
            requires_proof=payload.requires_proof,
            scheduled_time=payload.scheduled_time,
            coin_value=payload.coin_value,
            position=position,
        )
    )
    db.commit()
    db.refresh(routine)
    return _routine_payload(db, routine, profile.id)


@router.patch("/users/{user_id}/tasks/{task_id}")
def update_user_task(
    user_id: str,
    task_id: int,
    payload: TaskIn,
    _admin: Profile = Depends(require_admin),
    db: Session = Depends(get_db),
) -> dict:
    profile = _target_profile(db, user_id)
    task, routine = get_owned_task(db, task_id, profile.id)
    if payload.scheduled_time != task.scheduled_time:
        ensure_task_spacing(
            db,
            profile.id,
            [payload],
            routine_id=routine.id,
            exclude_task_id=task.id,
        )
    task.title = payload.title.strip()
    task.note = payload.note
    task.requires_proof = payload.requires_proof
    task.scheduled_time = payload.scheduled_time
    task.coin_value = payload.coin_value
    db.commit()
    db.refresh(routine)
    return _routine_payload(db, routine, profile.id)


@router.delete("/users/{user_id}/tasks/{task_id}")
def delete_user_task(
    user_id: str,
    task_id: int,
    _admin: Profile = Depends(require_admin),
    db: Session = Depends(get_db),
) -> dict:
    profile = _target_profile(db, user_id)
    task, routine = get_owned_task(db, task_id, profile.id)
    db.delete(task)
    db.commit()
    db.refresh(routine)
    return _routine_payload(db, routine, profile.id)


# --------------------------------------------------------------------------- #
# Shop inventory
# --------------------------------------------------------------------------- #
@router.post("/users/{user_id}/items/{slug}/grant")
def grant_shop_item(
    user_id: str,
    slug: str,
    _admin: Profile = Depends(require_admin),
    db: Session = Depends(get_db),
) -> dict:
    profile = _target_profile(db, user_id)
    item = db.get(ShopItem, slug)
    if not item:
        raise HTTPException(status_code=404, detail="That shop item does not exist.")
    if item.is_free:
        raise HTTPException(
            status_code=400,
            detail="Free items are already available to every account.",
        )
    owned = (
        db.query(Purchase)
        .filter(Purchase.user_id == profile.id, Purchase.item_slug == slug)
        .one_or_none()
    )
    if owned:
        raise HTTPException(status_code=409, detail="That user already owns this item.")

    db.add(Purchase(user_id=profile.id, item_slug=slug, price_paid=0))
    db.commit()
    return {
        "granted": True,
        "item": slug,
        "user": _user_summary(profile),
        "coins": profile.coins,
    }


@router.delete("/users/{user_id}/items/{slug}")
def remove_shop_item(
    user_id: str,
    slug: str,
    _admin: Profile = Depends(require_admin),
    db: Session = Depends(get_db),
) -> dict:
    profile = _target_profile(db, user_id)
    purchase = (
        db.query(Purchase)
        .filter(Purchase.user_id == profile.id, Purchase.item_slug == slug)
        .one_or_none()
    )
    if not purchase:
        raise HTTPException(
            status_code=404,
            detail="That user does not own this purchased item.",
        )

    item = db.get(ShopItem, slug)
    if item:
        if item.kind == "theme" and profile.theme_slug == slug:
            profile.theme_slug = DEFAULT_THEME
        elif item.kind == "avatar" and profile.avatar_slug == slug:
            profile.avatar_slug = DEFAULT_AVATAR

    db.delete(purchase)
    db.commit()
    return {
        "removed": True,
        "item": slug,
        "user": _user_summary(profile),
        "coins": profile.coins,
    }
