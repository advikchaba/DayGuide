"""Persist the serverless SQLite database in Supabase Storage.

Vercel functions have a read-only bundle and an ephemeral ``/tmp``. When no
Postgres ``DATABASE_URL`` is configured, the app keeps SQLite in ``/tmp`` and
mirrors a consistent snapshot to a **private** Supabase Storage bucket after
each request that changed the database.

This is a fallback, not a replacement for Postgres: adding ``DATABASE_URL``
switches the app to Supabase Postgres and this module stays dormant.
"""

from __future__ import annotations

import logging
import os
import sqlite3
import tempfile
import threading
from pathlib import Path
from urllib.parse import quote

import httpx

from ..config import settings

logger = logging.getLogger("routinery.db_sync")

BUCKET = "routinery-data"
OBJECT_KEY = "routinery.db"
RUNTIME_DB_PATH = Path("/tmp/routinery.db")

_lock = threading.Lock()
_last_uploaded_stamp: int | None = None
_bucket_ready = False


def enabled() -> bool:
    """True only for the Vercel + SQLite + Supabase Storage combination."""
    return bool(
        settings.is_serverless
        and settings.is_sqlite
        and settings.supabase_url.strip()
        and settings.supabase_service_key
    )


def _headers() -> dict[str, str]:
    key = settings.supabase_service_key
    headers = {"apikey": key}
    # New sb_secret_... keys are opaque API keys; legacy JWT keys also need
    # the Authorization header.
    if not key.startswith("sb_"):
        headers["Authorization"] = f"Bearer {key}"
    return headers


def _bucket_is_missing(response: httpx.Response) -> bool:
    if response.status_code == 404:
        return True
    if response.status_code != 400:
        return False
    try:
        payload = response.json()
    except ValueError:
        return "not found" in response.text.lower()
    return (
        str(payload.get("statusCode")) == "404"
        or payload.get("code") == "NoSuchBucket"
        or "not found" in str(payload.get("error", "")).lower()
        or "not found" in str(payload.get("message", "")).lower()
    )


def _ensure_bucket() -> None:
    global _bucket_ready
    if _bucket_ready:
        return

    base = settings.supabase_url.rstrip("/")
    bucket_url = f"{base}/storage/v1/bucket/{quote(BUCKET, safe='')}"
    try:
        response = httpx.get(bucket_url, headers=_headers(), timeout=20.0)
        if _bucket_is_missing(response):
            created = httpx.post(
                f"{base}/storage/v1/bucket",
                headers={**_headers(), "Content-Type": "application/json"},
                json={"id": BUCKET, "name": BUCKET, "public": False},
                timeout=20.0,
            )
            if created.status_code not in {200, 201, 400, 409}:
                raise RuntimeError(
                    f"Could not create the private database bucket ({created.status_code}): "
                    f"{created.text[:300]}"
                )
            if created.status_code in {400, 409}:
                check = httpx.get(bucket_url, headers=_headers(), timeout=20.0)
                if check.status_code != 200 or check.json().get("public"):
                    raise RuntimeError(
                        "The database bucket already exists but is not private. "
                        "Refusing to store account data in it."
                    )
            _bucket_ready = True
            return

        if response.status_code == 200:
            if response.json().get("public"):
                raise RuntimeError(
                    "The database bucket is public. Refusing to store account data in it."
                )
            _bucket_ready = True
            return

        raise RuntimeError(
            f"Could not inspect the database bucket ({response.status_code}): "
            f"{response.text[:300]}"
        )
    except httpx.HTTPError as exc:
        raise RuntimeError(f"Could not reach Supabase Storage: {exc}") from exc


def _object_url() -> str:
    base = settings.supabase_url.rstrip("/")
    return (
        f"{base}/storage/v1/object/authenticated/"
        f"{quote(BUCKET, safe='')}/{quote(OBJECT_KEY, safe='/')}"
    )


def _upload_url() -> str:
    base = settings.supabase_url.rstrip("/")
    return (
        f"{base}/storage/v1/object/"
        f"{quote(BUCKET, safe='')}/{quote(OBJECT_KEY, safe='/')}"
    )


def restore(path: Path | None = None) -> bool:
    """Download the last snapshot into ``path``. Missing object = fresh start."""
    if path is None:
        path = RUNTIME_DB_PATH
    if not enabled():
        return False

    _ensure_bucket()
    try:
        response = httpx.get(_object_url(), headers=_headers(), timeout=60.0)
    except httpx.HTTPError as exc:
        raise RuntimeError(f"Could not download the stored database: {exc}") from exc

    if response.status_code == 200:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(response.content)
        global _last_uploaded_stamp
        _last_uploaded_stamp = path.stat().st_mtime_ns
        logger.info("Restored SQLite database from Supabase Storage (%d bytes)", len(response.content))
        return True

    if response.status_code in {400, 404}:
        logger.info("No stored database snapshot yet; starting with a fresh SQLite file")
        return False

    raise RuntimeError(
        f"Could not download the stored database ({response.status_code}): "
        f"{response.text[:300]}"
    )


def _snapshot(path: Path) -> bytes:
    """Create a consistent copy of a live SQLite database."""
    fd, name = tempfile.mkstemp(prefix="routinery-", suffix=".db")
    os.close(fd)
    tmp_path = Path(name)
    try:
        source = sqlite3.connect(path, timeout=30.0)
        target = sqlite3.connect(tmp_path, timeout=30.0)
        try:
            with target:
                source.backup(target)
        finally:
            source.close()
            target.close()
        return tmp_path.read_bytes()
    finally:
        tmp_path.unlink(missing_ok=True)


def upload(path: Path | None = None, *, force: bool = False) -> bool:
    """Upload the database if it changed since the last successful upload."""
    if path is None:
        path = RUNTIME_DB_PATH
    if not enabled() or not path.is_file():
        return False

    global _last_uploaded_stamp
    stamp = path.stat().st_mtime_ns
    if not force and stamp == _last_uploaded_stamp:
        return False

    data = _snapshot(path)
    _ensure_bucket()

    with _lock:
        try:
            response = httpx.post(
                _upload_url(),
                headers={
                    **_headers(),
                    "Content-Type": "application/octet-stream",
                    "x-upsert": "true",
                },
                content=data,
                timeout=60.0,
            )
        except httpx.HTTPError as exc:
            raise RuntimeError(f"Could not upload the database snapshot: {exc}") from exc

        if response.status_code not in {200, 201}:
            raise RuntimeError(
                f"Supabase Storage rejected the database snapshot "
                f"({response.status_code}): {response.text[:300]}"
            )

    _last_uploaded_stamp = stamp
    logger.info("Persisted SQLite database to Supabase Storage (%d bytes)", len(data))
    return True
