"""Photo verification.

A user photographs the thing they claim to have done ("proof") and the service
decides whether the photo actually matches the task title. Three providers:

``mock``    heuristic used for local development (no external calls)
``openai``  any OpenAI-compatible vision endpoint (GPT-4o, Gemini proxy, local vLLM...)
``off``     everything lands in the manual review queue

The result is always one of ``approved`` / ``rejected`` / ``pending`` so the
caller can award coins, refuse the claim, or escalate to a human.
"""

from __future__ import annotations

import base64
import json
import logging
from dataclasses import dataclass

import httpx

from ..config import settings

logger = logging.getLogger("dayguide.vision")

_SYSTEM_PROMPT = (
    "You are DayGuide's proof referee. Users photograph evidence that they completed a routine task. "
    "You must decide whether the photo plausibly shows the claimed task being done or already completed. "
    "Be fair but strict: reject stock-looking images, screenshots of the task list, blank/black photos, "
    "photos of unrelated objects, and obvious duplicates. Accept ordinary evidence such as a gym selfie, "
    "a made bed, a filled water bottle, a finished page of study notes, a clean kitchen counter. "
    'Reply with JSON only: {"verified": true|false, "confidence": 0.0-1.0, "reason": "one short sentence"}.'
)


@dataclass
class VerificationResult:
    status: str  # approved | rejected | pending
    confidence: float
    reason: str
    provider: str

    @property
    def approved(self) -> bool:
        return self.status == "approved"


def _user_prompt(claimed: str, routine_name: str | None = None, extra: str | None = None) -> str:
    context = f"Routine: {routine_name}. " if routine_name else ""
    extra_text = f" {extra}" if extra else ""
    return f'{context}Claimed task: "{claimed}". Does the attached photo verify this task?{extra_text}'


def verify_photo(
    image_bytes: bytes,
    *,
    claimed: str,
    routine_name: str | None = None,
    content_type: str = "image/jpeg",
    extra: str | None = None,
) -> VerificationResult:
    provider = (settings.vision_provider or "off").strip().lower()

    if provider == "openai" and settings.vision_api_key:
        try:
            return _verify_with_vision_model(
                image_bytes, claimed=claimed, routine_name=routine_name, content_type=content_type, extra=extra
            )
        except Exception as exc:  # noqa: BLE001 - never break the request on a provider outage
            logger.warning("Vision provider failed, escalating to manual review: %s", exc)
            return VerificationResult(
                status="pending",
                confidence=0.0,
                reason="Automatic verification unavailable - queued for human review.",
                provider="openai",
            )

    if provider == "mock":
        return _mock_verify(image_bytes)

    return VerificationResult(
        status="pending",
        confidence=0.0,
        reason="No automatic verifier configured - queued for human review.",
        provider=provider or "off",
    )


# --------------------------------------------------------------------------- #
# Providers
# --------------------------------------------------------------------------- #
def _mock_verify(image_bytes: bytes) -> VerificationResult:
    """Development provider: accepts any photo that looks like a real image."""
    from .storage import looks_like_image

    if not looks_like_image(image_bytes):
        return VerificationResult(
            status="rejected",
            confidence=0.95,
            reason="That file is not a photo. Upload a JPEG, PNG or WebP image.",
            provider="mock",
        )

    if len(image_bytes) < 2_000:
        return VerificationResult(
            status="rejected",
            confidence=0.7,
            reason="The photo is too small to verify anything. Try again with a full-size picture.",
            provider="mock",
        )

    if settings.auto_approve_proofs:
        return VerificationResult(
            status="approved",
            confidence=0.62,
            reason="Auto-approved by the development verifier.",
            provider="mock",
        )

    return VerificationResult(
        status="pending",
        confidence=0.0,
        reason="Development verifier is in review mode - waiting for a human.",
        provider="mock",
    )


def _verify_with_vision_model(
    image_bytes: bytes,
    *,
    claimed: str,
    routine_name: str | None,
    content_type: str,
    extra: str | None = None,
) -> VerificationResult:
    mime = content_type if content_type.startswith("image/") else "image/jpeg"
    data_url = f"data:{mime};base64,{base64.b64encode(image_bytes).decode()}"

    payload = {
        "model": settings.vision_model,
        "temperature": 0,
        "max_tokens": 200,
        "response_format": {"type": "json_object"},
        "messages": [
            {"role": "system", "content": _SYSTEM_PROMPT},
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": _user_prompt(claimed, routine_name, extra)},
                    {"type": "image_url", "image_url": {"url": data_url, "detail": "low"}},
                ],
            },
        ],
    }

    url = f"{settings.vision_base_url.rstrip('/')}/chat/completions"
    with httpx.Client(timeout=45.0) as client:
        response = client.post(
            url,
            headers={
                "Authorization": f"Bearer {settings.vision_api_key}",
                "Content-Type": "application/json",
            },
            json=payload,
        )
        response.raise_for_status()
        body = response.json()

    content = body["choices"][0]["message"]["content"]
    parsed = json.loads(content) if isinstance(content, str) else content
    verified = bool(parsed.get("verified"))
    confidence = float(parsed.get("confidence") or 0.0)
    reason = str(parsed.get("reason") or "")[:380]

    return VerificationResult(
        status="approved" if verified else "rejected",
        confidence=confidence,
        reason=reason or ("Verified by the vision model." if verified else "The photo did not match the task."),
        provider=f"openai:{settings.vision_model}",
    )
