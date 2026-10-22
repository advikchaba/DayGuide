"""Public ladder + manual proof review queue."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..auth import get_current_profile, require_admin
from ..database import get_db
from ..economy import rank_for
from ..models import Match, Profile, Proof
from ..schemas import LeaderboardEntry, LeaderboardOut, ReviewRequest
from ..serializers import serialize_match, serialize_proof
from ..services.proofs import finalize_proof, unreward_proof
from ..services.storage import public_url
from ..services.vision import VerificationResult

router = APIRouter(tags=["leaderboard"])


# --------------------------------------------------------------------------- #
# Leaderboard
# --------------------------------------------------------------------------- #
def _entry(position: int, profile: Profile, viewer_id: str) -> dict:
    rank = rank_for(profile.elo)
    return {
        "position": position,
        "user_id": profile.id,
        "username": profile.username,
        "avatar_slug": profile.avatar_slug,
        "avatar_url": public_url(profile.avatar_path) if profile.avatar_path else None,
        "elo": profile.elo,
        "rank_name": rank.name,
        "rank_color": rank.color,
        "coins": profile.coins,
        "matches_won": profile.matches_won,
        "streak": profile.streak,
        "is_you": profile.id == viewer_id,
    }


@router.get("/leaderboard", response_model=LeaderboardOut)
def leaderboard(
    limit: int = Query(default=25, ge=1, le=100),
    metric: str = Query(default="elo", pattern="^(elo|coins|matches_won|streak)$"),
    profile: Profile = Depends(get_current_profile),
    db: Session = Depends(get_db),
) -> dict:
    column = {
        "elo": Profile.elo,
        "coins": Profile.coins,
        "matches_won": Profile.matches_won,
        "streak": Profile.best_streak,
    }[metric]

    rows = (
        db.query(Profile)
        .filter(Profile.username.isnot(None))
        .order_by(column.desc(), Profile.elo.desc())
        .limit(limit)
        .all()
    )
    total = db.query(func.count(Profile.id)).filter(Profile.username.isnot(None)).scalar() or 0

    my_position = (
        db.query(func.count(Profile.id))
        .filter(Profile.username.isnot(None))
        .filter(column > getattr(profile, metric if metric != "streak" else "best_streak"))
        .scalar()
        or 0
    ) + 1

    return {
        "entries": [_entry(index + 1, row, profile.id) for index, row in enumerate(rows)],
        "you": _entry(my_position, profile, profile.id) if profile.username else None,
        "total_players": total,
    }


# --------------------------------------------------------------------------- #
# Verification queue (admin only)
# --------------------------------------------------------------------------- #
@router.get("/admin/proofs")
def list_pending_proofs(
    status_filter: str = Query(default="pending", alias="status", pattern="^(pending|approved|rejected|all)$"),
    limit: int = Query(default=40, ge=1, le=100),
    _admin: Profile = Depends(require_admin),
    db: Session = Depends(get_db),
) -> dict:
    query = db.query(Proof)
    if status_filter != "all":
        query = query.filter(Proof.status == status_filter)

    proofs = query.order_by(Proof.created_at.desc()).limit(limit).all()
    return {
        "count": len(proofs),
        "items": [serialize_proof(db, proof) for proof in proofs],
    }


@router.post("/admin/proofs/{proof_id}/review")
def review_proof(
    proof_id: int,
    payload: ReviewRequest,
    admin: Profile = Depends(require_admin),
    db: Session = Depends(get_db),
) -> dict:
    proof = db.get(Proof, proof_id)
    if not proof:
        raise HTTPException(status_code=404, detail="Proof not found.")

    owner = db.get(Profile, proof.user_id)
    if not owner:
        raise HTTPException(status_code=404, detail="The submitting user no longer exists.")

    reviewer = f"human:{admin.email}"

    if not payload.approve:
        unreward_proof(db, proof)
        return {"proof": serialize_proof(db, proof), "approved": False}

    result = VerificationResult(
        status="approved",
        confidence=max(proof.confidence, 0.75),
        reason=payload.reason or "Approved by a moderator.",
        provider="human",
    )
    outcome = finalize_proof(db, owner, proof, result, reviewer=reviewer)

    response = {
        "proof": serialize_proof(db, proof),
        "approved": outcome.approved,
        "coins_awarded": outcome.coins_awarded,
        "elo_awarded": outcome.elo_awarded,
    }
    if outcome.match:
        db.refresh(outcome.match)
        response["match"] = serialize_match(db, outcome.match, owner.id)
    return response


@router.get("/admin/matches")
def list_matches(
    status_filter: str = Query(default="active", alias="status", pattern="^(waiting|active|finished|all)$"),
    limit: int = Query(default=25, ge=1, le=100),
    _admin: Profile = Depends(require_admin),
    db: Session = Depends(get_db),
) -> dict:
    query = db.query(Match)
    if status_filter != "all":
        query = query.filter(Match.status == status_filter)
    matches = query.order_by(Match.created_at.desc()).limit(limit).all()
    return {
        "count": len(matches),
        "items": [
            {
                "id": match.id,
                "code": match.code,
                "status": match.status,
                "routine_name": match.routine_name,
                "created_at": match.created_at.isoformat(),
                "players": [player.user_id for player in match.players],
                "winner_id": match.winner_id,
            }
            for match in matches
        ],
    }
