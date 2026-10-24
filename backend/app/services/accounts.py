"""Account deletion shared by the admin API."""

from __future__ import annotations

import logging
from urllib.parse import quote

import httpx
from sqlalchemy import or_
from sqlalchemy.orm import Session

from ..config import settings
from ..models import (
    DeletedAccount,
    LedgerEntry,
    Match,
    MatchPlayer,
    MatchTask,
    PerfectDay,
    Profile,
    Proof,
    Purchase,
    Routine,
    Task,
    TaskCompletion,
    utcnow,
)

logger = logging.getLogger("dayguide.accounts")


class AccountDeletionError(Exception):
    def __init__(self, detail: str, status_code: int = 502) -> None:
        super().__init__(detail)
        self.detail = detail
        self.status_code = status_code


def _auth_admin_headers() -> dict[str, str]:
    key = settings.supabase_service_key
    # New sb_secret_... keys are opaque API keys, not JWTs. Legacy
    # service_role keys work as bearer tokens as well.
    headers = {"apikey": key}
    if not key.startswith("sb_"):
        headers["Authorization"] = f"Bearer {key}"
    return headers


def delete_supabase_identity(user_id: str) -> None:
    """Delete the Supabase Auth user so the same email can sign up again.

    Seeded/demo profiles have no auth identity; Supabase answers 404, which is
    treated as already deleted.
    """
    if not settings.supabase_configured:
        return

    if not settings.supabase_service_key:
        raise AccountDeletionError(
            "Permanent account deletion needs SUPABASE_SERVICE_ROLE_KEY or "
            "SUPABASE_SECRET_KEY on the API.",
            status_code=503,
        )

    url = (
        f"{settings.supabase_url.rstrip('/')}/auth/v1/admin/users/"
        f"{quote(user_id, safe='')}"
    )
    try:
        response = httpx.delete(
            url,
            headers=_auth_admin_headers(),
            timeout=15.0,
        )
    except httpx.HTTPError as exc:
        logger.warning("Supabase auth deletion failed for %s: %s", user_id, exc)
        raise AccountDeletionError(
            "Could not reach Supabase Auth to delete the sign-in identity. "
            "The account was left unchanged."
        ) from exc

    if response.status_code in {200, 204, 404}:
        return

    logger.warning(
        "Supabase auth deletion rejected for %s (%s): %s",
        user_id,
        response.status_code,
        response.text[:300],
    )
    raise AccountDeletionError(
        "Supabase Auth refused to delete the sign-in identity. Check that the "
        "service-role key is valid and has admin permissions."
    )


def mark_account_deleted(db: Session, profile: Profile) -> None:
    """Block the old auth token before the slower local purge begins.

    The admin route calls this immediately after Supabase Auth deletes the
    identity. If the local purge fails afterwards, an unexpired token still
    cannot recreate or use the remaining profile, and the admin can retry.
    """
    tombstone = db.get(DeletedAccount, profile.id)
    if tombstone:
        tombstone.email = profile.email
        tombstone.deleted_at = utcnow()
    else:
        db.add(DeletedAccount(user_id=profile.id, email=profile.email))
    try:
        db.commit()
    except Exception:
        db.rollback()
        raise


def purge_local_account(db: Session, profile: Profile) -> list[str]:
    """Delete every local row owned by a profile.

    A tombstone must already exist from :func:`mark_account_deleted`; the
    upsert below keeps this function safe to retry. Returns stored image paths
    so the caller can clean up storage after the database transaction commits.
    """
    user_id = profile.id
    routine_ids = [
        row[0]
        for row in db.query(Routine.id).filter(Routine.user_id == user_id).all()
    ]
    task_ids = (
        [
            row[0]
            for row in db.query(Task.id).filter(Task.routine_id.in_(routine_ids)).all()
        ]
        if routine_ids
        else []
    )
    match_ids = [
        row[0]
        for row in db.query(Match.id).filter(Match.creator_id == user_id).all()
    ]

    image_paths = [profile.avatar_path] if profile.avatar_path else []
    proof_filters = [Proof.user_id == user_id]
    if task_ids:
        proof_filters.append(Proof.task_id.in_(task_ids))
    if match_ids:
        proof_filters.append(Proof.match_id.in_(match_ids))
    image_paths.extend(
        row[0]
        for row in db.query(Proof.image_path).filter(or_(*proof_filters)).all()
        if row[0]
    )

    db.query(Proof).filter(or_(*proof_filters)).delete(synchronize_session=False)

    completion_filters = [TaskCompletion.user_id == user_id]
    if task_ids:
        completion_filters.append(TaskCompletion.task_id.in_(task_ids))
    db.query(TaskCompletion).filter(or_(*completion_filters)).delete(
        synchronize_session=False
    )

    perfect_filters = [PerfectDay.user_id == user_id]
    if routine_ids:
        perfect_filters.append(PerfectDay.routine_id.in_(routine_ids))
    db.query(PerfectDay).filter(or_(*perfect_filters)).delete(synchronize_session=False)

    db.query(LedgerEntry).filter(LedgerEntry.user_id == user_id).delete(
        synchronize_session=False
    )
    db.query(Purchase).filter(Purchase.user_id == user_id).delete(
        synchronize_session=False
    )

    player_filters = [MatchPlayer.user_id == user_id]
    if match_ids:
        player_filters.append(MatchPlayer.match_id.in_(match_ids))
    db.query(MatchPlayer).filter(or_(*player_filters)).delete(synchronize_session=False)

    if match_ids:
        db.query(MatchTask).filter(MatchTask.match_id.in_(match_ids)).delete(
            synchronize_session=False
        )
        db.query(Match).filter(Match.id.in_(match_ids)).delete(synchronize_session=False)

    db.query(Match).filter(Match.winner_id == user_id).update(
        {Match.winner_id: None}, synchronize_session=False
    )

    if task_ids:
        db.query(Task).filter(Task.id.in_(task_ids)).delete(synchronize_session=False)
    if routine_ids:
        db.query(Routine).filter(Routine.id.in_(routine_ids)).delete(
            synchronize_session=False
        )

    tombstone = db.get(DeletedAccount, user_id)
    if tombstone:
        tombstone.email = profile.email
        tombstone.deleted_at = utcnow()
    else:
        db.add(DeletedAccount(user_id=user_id, email=profile.email))

    db.delete(profile)
    try:
        db.commit()
    except Exception:
        db.rollback()
        raise

    return image_paths
