"""Proof photo storage.

Local disk is used for development (``UPLOAD_DIR``, served at ``/uploads``).
When ``SUPABASE_URL`` and a server-side Supabase key are configured, images are
uploaded to Supabase Storage instead so they survive serverless cold starts.
"""

from __future__ import annotations

import logging
import uuid
from pathlib import Path
from urllib.parse import quote

import httpx

from ..config import settings

logger = logging.getLogger("routinery.storage")

MAX_UPLOAD_BYTES = 8 * 1024 * 1024  # fallback when MAX_UPLOAD_BYTES is unset

_MAGIC = (
    (b"\xff\xd8\xff", "jpg", "image/jpeg"),
    (b"\x89PNG\r\n\x1a\n", "png", "image/png"),
    (b"RIFF", "webp", "image/webp"),
)

_bucket_ready = False


def uploads_root() -> Path:
    root = Path(settings.upload_dir).resolve()
    (root / "proofs").mkdir(parents=True, exist_ok=True)
    return root


def detect_image_type(data: bytes) -> tuple[str, str] | None:
    for magic, extension, mime in _MAGIC:
        if data.startswith(magic):
            if magic == b"RIFF" and data[8:12] != b"WEBP":
                continue
            return extension, mime
    return None


def looks_like_image(data: bytes) -> bool:
    return detect_image_type(data) is not None


# --------------------------------------------------------------------------- #
# Supabase Storage
# --------------------------------------------------------------------------- #
def _storage_base() -> str:
    return settings.supabase_url.rstrip("/")


def _bucket() -> str:
    return settings.supabase_storage_bucket.strip()


def _storage_headers() -> dict[str, str]:
    key = settings.supabase_service_key
    # New sb_secret_... keys are opaque API keys, not JWTs: Supabase expects
    # them on `apikey` only. Legacy service_role JWTs also go in Authorization.
    headers = {"apikey": key}
    if not key.startswith("sb_"):
        headers["Authorization"] = f"Bearer {key}"
    return headers


def _ensure_bucket() -> None:
    """Create the public proofs bucket once per process if it is missing."""
    global _bucket_ready
    if _bucket_ready:
        return

    bucket = _bucket()
    base = _storage_base()
    if not (base and bucket and settings.supabase_service_key):
        raise RuntimeError(
            "Supabase Storage is not configured. Set SUPABASE_URL and "
            "SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SECRET_KEY)."
        )

    bucket_url = f"{base}/storage/v1/bucket/{quote(bucket, safe='')}"
    try:
        response = httpx.get(bucket_url, headers=_storage_headers(), timeout=10.0)
        if response.status_code == 404:
            created = httpx.post(
                f"{base}/storage/v1/bucket",
                headers={**_storage_headers(), "Content-Type": "application/json"},
                json={"id": bucket, "name": bucket, "public": True},
                timeout=10.0,
            )
            if created.status_code not in {200, 201, 400, 409}:
                raise RuntimeError(
                    f"Could not create the Supabase Storage bucket '{bucket}' "
                    f"({created.status_code}): {created.text[:300]}"
                )
        elif response.status_code == 200:
            if not response.json().get("public"):
                updated = httpx.put(
                    bucket_url,
                    headers={**_storage_headers(), "Content-Type": "application/json"},
                    json={"public": True},
                    timeout=10.0,
                )
                if updated.status_code not in {200, 201}:
                    raise RuntimeError(
                        f"Could not make the Supabase Storage bucket '{bucket}' public "
                        f"({updated.status_code}): {updated.text[:300]}"
                    )
        else:
            raise RuntimeError(
                f"Could not inspect the Supabase Storage bucket '{bucket}' "
                f"({response.status_code}): {response.text[:300]}"
            )
    except httpx.HTTPError as exc:
        raise RuntimeError(f"Could not reach Supabase Storage: {exc}") from exc

    _bucket_ready = True


def _object_key(relative_path: str) -> str:
    """Map the local ``proofs/foo.jpg`` layout onto the bucket root."""
    key = relative_path.lstrip("/")
    return key[len("proofs/") :] if key.startswith("proofs/") else key


def _supabase_object_url(relative_path: str) -> str:
    return (
        f"{_storage_base()}/storage/v1/object/"
        f"{quote(_bucket(), safe='')}/{quote(_object_key(relative_path), safe='/')}"
    )


def _upload_to_supabase(relative_path: str, data: bytes, mime: str) -> None:
    _ensure_bucket()
    try:
        response = httpx.post(
            _supabase_object_url(relative_path),
            headers={
                **_storage_headers(),
                "Content-Type": mime,
                "x-upsert": "true",
            },
            content=data,
            timeout=30.0,
        )
    except httpx.HTTPError as exc:
        raise RuntimeError(f"Could not upload the photo to Supabase Storage: {exc}") from exc

    if response.status_code not in {200, 201}:
        raise RuntimeError(
            f"Supabase Storage rejected the photo ({response.status_code}): {response.text[:300]}"
        )


# --------------------------------------------------------------------------- #
# Public API used by the routers
# --------------------------------------------------------------------------- #
def save_proof_image(data: bytes, user_id: str) -> tuple[str, str]:
    """Persist an uploaded image and return ``(relative_path, mime_type)``."""
    detected = detect_image_type(data)
    if not detected:
        raise ValueError("Unsupported image format. Upload a JPEG, PNG or WebP photo.")

    limit = settings.max_upload_bytes if settings.max_upload_bytes > 0 else MAX_UPLOAD_BYTES
    if len(data) > limit:
        limit_mb = max(1, round(limit / (1024 * 1024)))
        raise ValueError(f"That photo is larger than {limit_mb} MB. Try a smaller one.")

    extension, mime = detected
    filename = f"{user_id[:8]}-{uuid.uuid4().hex[:16]}.{extension}"
    relative_path = f"proofs/{filename}"

    if settings.supabase_storage_configured:
        _upload_to_supabase(relative_path, data, mime)
    else:
        try:
            target = uploads_root() / relative_path
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(data)
        except OSError as exc:
            raise RuntimeError(
                "Could not save the photo to local disk. Configure Supabase Storage "
                "(SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY) for deployed environments."
            ) from exc

    return relative_path, mime


def delete_proof_image(relative_path: str) -> None:
    if settings.supabase_storage_configured:
        try:
            response = httpx.delete(
                _supabase_object_url(relative_path),
                headers=_storage_headers(),
                timeout=15.0,
            )
            if response.status_code not in {200, 204, 404}:
                logger.warning(
                    "Supabase Storage delete failed for %s (%s): %s",
                    relative_path,
                    response.status_code,
                    response.text[:200],
                )
        except httpx.HTTPError as exc:
            logger.warning("Supabase Storage delete failed for %s: %s", relative_path, exc)
        return

    try:
        target = (uploads_root() / relative_path).resolve()
        if target.is_file() and uploads_root() in target.parents:
            target.unlink()
    except OSError:
        pass


def public_url(relative_path: str) -> str:
    """Absolute URL the frontend can load for a stored proof photo."""
    cleaned = relative_path.lstrip("/")

    if settings.supabase_storage_configured:
        return (
            f"{_storage_base()}/storage/v1/object/public/"
            f"{quote(_bucket(), safe='')}/{quote(_object_key(cleaned), safe='/')}"
        )

    if settings.public_base_url.strip():
        return f"{settings.public_base_url.rstrip('/')}/uploads/{cleaned}"

    return f"/uploads/{cleaned}"
