"""Local file storage for proof photos.

Photos live outside the database (``UPLOAD_DIR``, served at ``/uploads``) which
keeps rows small and lets you move to S3/Supabase Storage later by swapping the
two functions in here.
"""

from __future__ import annotations

import uuid
from pathlib import Path

from ..config import settings

MAX_UPLOAD_BYTES = 8 * 1024 * 1024  # 8 MB

_MAGIC = (
    (b"\xff\xd8\xff", "jpg", "image/jpeg"),
    (b"\x89PNG\r\n\x1a\n", "png", "image/png"),
    (b"RIFF", "webp", "image/webp"),
)


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


def save_proof_image(data: bytes, user_id: str) -> tuple[str, str]:
    """Persist an uploaded image and return ``(relative_path, mime_type)``."""
    detected = detect_image_type(data)
    if not detected:
        raise ValueError("Unsupported image format. Upload a JPEG, PNG or WebP photo.")
    if len(data) > MAX_UPLOAD_BYTES:
        raise ValueError("That photo is larger than 8 MB. Try a smaller one.")

    extension, mime = detected
    filename = f"{user_id[:8]}-{uuid.uuid4().hex[:16]}.{extension}"
    target = uploads_root() / "proofs" / filename
    target.write_bytes(data)
    return f"proofs/{filename}", mime


def delete_proof_image(relative_path: str) -> None:
    try:
        target = (uploads_root() / relative_path).resolve()
        if target.is_file() and uploads_root() in target.parents:
            target.unlink()
    except OSError:
        pass


def public_url(relative_path: str) -> str:
    """URL the frontend can load (``/uploads/proofs/xyz.jpg``)."""
    return f"/uploads/{relative_path.lstrip('/')}"
