"""Local development auth provider.

Mirrors the Supabase contract (email + password signup/signin returning a bearer
token) so the frontend can run the exact same code path with or without a
Supabase project configured. Disabled with ``DEV_AUTH=false``.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ..auth import create_local_user, get_current_profile, profile_payload
from ..config import settings
from ..database import get_db
from ..economy import apply_rewards
from ..models import Profile
from ..schemas import ProfileOut, DevGrantRequest, DevLoginRequest, DevSignupRequest, TokenResponse
from ..security import create_dev_token, hash_password, verify_password

router = APIRouter(prefix="/auth/dev", tags=["auth"])

TOKEN_TTL_HOURS = 24 * 7


def _ensure_enabled() -> None:
    if not settings.dev_auth_enabled:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Local auth is disabled. Use Supabase to sign in.",
        )


@router.post("/signup", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
def dev_signup(payload: DevSignupRequest, db: Session = Depends(get_db)) -> TokenResponse:
    _ensure_enabled()
    email = payload.email.lower()

    if db.query(Profile).filter(Profile.email == email).first():
        raise HTTPException(status_code=409, detail="An account with that email already exists.")

    if payload.username:
        taken = db.query(Profile).filter(Profile.username == payload.username).first()
        if taken:
            raise HTTPException(status_code=409, detail="That username is already taken.")

    profile = create_local_user(db, email, hash_password(payload.password))
    if payload.username:
        profile.username = payload.username
        db.commit()
        db.refresh(profile)

    token = create_dev_token(profile.id, profile.email, TOKEN_TTL_HOURS)
    return TokenResponse(
        access_token=token,
        expires_in=TOKEN_TTL_HOURS * 3600,
        profile=profile_payload(profile),
    )


@router.post("/login", response_model=TokenResponse)
def dev_login(payload: DevLoginRequest, db: Session = Depends(get_db)) -> TokenResponse:
    _ensure_enabled()
    profile = db.query(Profile).filter(Profile.email == payload.email.lower()).one_or_none()
    if not profile or not profile.password_hash or not verify_password(payload.password, profile.password_hash):
        raise HTTPException(status_code=401, detail="Incorrect email or password.")

    token = create_dev_token(profile.id, profile.email, TOKEN_TTL_HOURS)
    return TokenResponse(
        access_token=token,
        expires_in=TOKEN_TTL_HOURS * 3600,
        profile=profile_payload(profile),
    )


@router.post("/grant", response_model=ProfileOut)
def dev_grant(
    payload: DevGrantRequest,
    profile: Profile = Depends(get_current_profile),
    db: Session = Depends(get_db),
) -> dict:
    """Test-only coin/ELO top-up so you can try themes without grinding.

    Available only while ``DEV_AUTH`` is on and never in production.
    """
    _ensure_enabled()
    if settings.is_production:
        raise HTTPException(status_code=403, detail="Not available in production.")

    apply_rewards(db, profile, coins=payload.coins, elo=payload.elo, reason="Development grant")
    db.commit()
    db.refresh(profile)
    return profile_payload(profile)
