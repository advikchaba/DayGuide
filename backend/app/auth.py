"""Authentication: turn a bearer token into a `Profile`.

Two token sources are supported, both resulting in the same dependency:

* **Supabase** - production. Tokens are verified locally with the project JWT
  secret when it is configured, otherwise against the Supabase Auth server.
* **Dev tokens** - local development without Supabase. Issued by
  ``/api/auth/dev/*`` and signed with ``DEV_JWT_SECRET``.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass

import httpx
import jwt
from fastapi import Depends, Header, HTTPException, status
from sqlalchemy.orm import Session

from .catalog import DEFAULT_AVATAR, DEFAULT_THEME
from .config import settings
from .database import get_db
from .economy import STARTING_COINS, rank_for
from .models import Profile
from .security import decode_dev_token, new_user_id

logger = logging.getLogger("routinery.auth")


class AuthError(HTTPException):
    def __init__(self, detail: str = "Not authenticated") -> None:
        super().__init__(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=detail,
            headers={"WWW-Authenticate": "Bearer"},
        )


@dataclass
class Identity:
    user_id: str
    email: str
    provider: str


# --------------------------------------------------------------------------- #
# Token verification
# --------------------------------------------------------------------------- #
def _verify_with_secret(token: str) -> dict | None:
    if not settings.supabase_jwt_secret:
        return None
    try:
        return jwt.decode(
            token,
            settings.supabase_jwt_secret,
            algorithms=["HS256", "HS384", "HS512"],
            audience=settings.supabase_jwt_audience,
            options={"verify_aud": True},
        )
    except jwt.PyJWTError as exc:
        logger.debug("Local JWT verification failed: %s", exc)
        return None


def _verify_with_gotrue(token: str) -> dict | None:
    """Fallback for projects using asymmetric signing keys (ES256/RS256)."""
    if not settings.supabase_configured:
        return None
    try:
        response = httpx.get(
            f"{settings.supabase_url.rstrip('/')}/auth/v1/user",
            headers={
                "Authorization": f"Bearer {token}",
                "apikey": settings.supabase_public_key,
            },
            timeout=8.0,
        )
    except httpx.HTTPError as exc:
        logger.warning("Supabase auth request failed: %s", exc)
        return None

    if response.status_code != 200:
        return None
    payload = response.json()
    return {"sub": payload.get("id"), "email": payload.get("email")}


def resolve_identity(token: str) -> Identity:
    if settings.dev_auth_enabled:
        payload = decode_dev_token(token)
        if payload:
            return Identity(user_id=payload["sub"], email=payload.get("email", ""), provider="dev")

    payload = _verify_with_secret(token) or _verify_with_gotrue(token)
    if not payload or not payload.get("sub"):
        raise AuthError("Invalid or expired session. Please sign in again.")

    return Identity(user_id=payload["sub"], email=payload.get("email") or "", provider="supabase")


# --------------------------------------------------------------------------- #
# Profile provisioning
# --------------------------------------------------------------------------- #
def provision_profile(db: Session, identity: Identity) -> Profile:
    """Return the profile for an identity, creating it on first login."""
    profile = db.get(Profile, identity.user_id)
    if profile:
        if identity.email and profile.email != identity.email:
            profile.email = identity.email
            db.commit()
        return profile

    # A new auth user with no profile yet: bootstrap the account. They start
    # with no routine - building one is the first thing the app asks them to do.
    profile = Profile(
        id=identity.user_id,
        email=identity.email or f"{identity.user_id}@routinery.local",
        coins=STARTING_COINS,
        elo=100,
        avatar_slug=DEFAULT_AVATAR,
        theme_slug=DEFAULT_THEME,
    )
    db.add(profile)
    db.commit()
    db.refresh(profile)
    logger.info("Provisioned new profile %s", profile.id)
    return profile


def create_local_user(db: Session, email: str, password_hash: str) -> Profile:
    """Create a fully local (dev-auth) user row with no starter routine."""
    profile = Profile(
        id=new_user_id(),
        email=email.lower(),
        password_hash=password_hash,
        coins=STARTING_COINS,
        elo=100,
        avatar_slug=DEFAULT_AVATAR,
        theme_slug=DEFAULT_THEME,
    )
    db.add(profile)
    db.commit()
    db.refresh(profile)
    return profile


# --------------------------------------------------------------------------- #
# FastAPI dependencies
# --------------------------------------------------------------------------- #
def _extract_token(authorization: str | None) -> str:
    if not authorization:
        raise AuthError("Missing Authorization header")
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token.strip():
        raise AuthError("Authorization header must be `Bearer <token>`")
    return token.strip()


def get_current_profile(
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> Profile:
    identity = resolve_identity(_extract_token(authorization))
    return provision_profile(db, identity)


def get_current_user_id(profile: Profile = Depends(get_current_profile)) -> str:
    return profile.id


def require_admin(profile: Profile = Depends(get_current_profile)) -> Profile:
    admins = settings.admin_email_set
    if not admins or (profile.email or "").lower() not in admins:
        raise HTTPException(status_code=403, detail="Admin access required")
    return profile


def profile_payload(profile: Profile) -> dict:
    """Canonical profile representation returned by the API."""
    rank = rank_for(profile.elo)
    return {
        "id": profile.id,
        "email": profile.email,
        "username": profile.username,
        "username_changes": profile.username_changes,
        "username_change_cost": 400,
        "coins": profile.coins,
        "elo": profile.elo,
        "rank": {
            "name": rank.name,
            "min_elo": rank.min_elo,
            "max_elo": rank.max_elo,
            "color": rank.color,
            "progress": rank.progress,
            "elo_to_next": rank.elo_to_next,
        },
        "avatar_slug": profile.avatar_slug,
        "theme_slug": profile.theme_slug,
        "streak": profile.streak,
        "best_streak": profile.best_streak,
        "routines_completed": profile.routines_completed,
        "tasks_completed": profile.tasks_completed,
        "matches_won": profile.matches_won,
        "matches_played": profile.matches_played,
        "last_perfect_on": profile.last_perfect_on.isoformat() if profile.last_perfect_on else None,
        "created_at": profile.created_at.isoformat(),
    }
