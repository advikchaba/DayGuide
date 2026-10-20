"""Password hashing and token helpers for the local (dev) auth provider.

Supabase handles password storage in production. These helpers only back the
offline development login flow, which mimics the Supabase contract so the
frontend can use a single authentication code path.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import os
import secrets
import uuid
from datetime import datetime, timedelta, timezone

import jwt

from .config import settings

_PBKDF2_ROUNDS = 210_000
_ALGORITHM = "HS256"


# --------------------------------------------------------------------------- #
# Passwords
# --------------------------------------------------------------------------- #
def hash_password(password: str) -> str:
    salt = os.urandom(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, _PBKDF2_ROUNDS)
    return "pbkdf2_sha256${}${}${}".format(
        _PBKDF2_ROUNDS,
        base64.b64encode(salt).decode(),
        base64.b64encode(digest).decode(),
    )


def verify_password(password: str, stored: str) -> bool:
    try:
        scheme, rounds, salt_b64, digest_b64 = stored.split("$")
        if scheme != "pbkdf2_sha256":
            return False
        salt = base64.b64decode(salt_b64)
        expected = base64.b64decode(digest_b64)
        candidate = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, int(rounds))
        return hmac.compare_digest(candidate, expected)
    except Exception:  # malformed hash -> treat as failure
        return False


def new_user_id() -> str:
    return str(uuid.uuid4())


# --------------------------------------------------------------------------- #
# Tokens
# --------------------------------------------------------------------------- #
def create_dev_token(user_id: str, email: str, expires_in_hours: int = 24 * 7) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": user_id,
        "email": email,
        "aud": settings.supabase_jwt_audience,
        "role": "authenticated",
        "iss": "routinery-dev",
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(hours=expires_in_hours)).timestamp()),
    }
    return jwt.encode(payload, settings.dev_jwt_secret, algorithm=_ALGORITHM)


def decode_dev_token(token: str) -> dict | None:
    try:
        return jwt.decode(
            token,
            settings.dev_jwt_secret,
            algorithms=[_ALGORITHM],
            audience=settings.supabase_jwt_audience,
        )
    except jwt.PyJWTError:
        return None


def generate_match_code() -> str:
    """Human friendly 6 character code used to join a head-to-head race."""
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    return "".join(secrets.choice(alphabet) for _ in range(6))
