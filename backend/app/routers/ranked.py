"""Ranked mode: matchmaking, head-to-head checklist races and photo judging.

Flow
----
1. ``POST /ranked/queue``          find an open race with a similar ELO, or open one
2. ``GET  /ranked/matches/{id}``   poll the race state
3. ``POST /ranked/matches/{id}/proof``  submit photo evidence per checklist item
4. first player with every item verified wins -> ELO + coins are awarded server side
"""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from ..auth import get_current_profile
from ..config import settings
from ..database import get_db
from ..economy import rank_for, today
from ..models import Match, MatchPlayer, MatchTask, Profile, Proof, Routine, Task
from ..schemas import (
    MatchJoinRequest,
    MatchOut,
    ProofVerificationOut,
    QueueRequest,
)
from ..security import generate_match_code
from ..serializers import serialize_match, serialize_proof
from ..services.proofs import finalize_proof
from ..services.storage import public_url, save_proof_image
from ..services.vision import verify_photo

router = APIRouter(prefix="/ranked", tags=["ranked"])

MAX_RACE_TASKS = 12
ELO_MATCH_WINDOW = 400


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #
def _open_match_for(db: Session, user_id: str) -> Match | None:
    return (
        db.query(Match)
        .join(MatchPlayer, MatchPlayer.match_id == Match.id)
        .filter(MatchPlayer.user_id == user_id, Match.status.in_(("waiting", "active")))
        .order_by(Match.created_at.desc())
        .first()
    )


def _tasks_from_routine(db: Session, routine: Routine) -> list[Task]:
    tasks = sorted(routine.tasks, key=lambda t: t.position)
    return tasks[:MAX_RACE_TASKS]


def _make_match(db: Session, profile: Profile, routine: Routine) -> Match:
    tasks = _tasks_from_routine(db, routine)
    if not tasks:
        raise HTTPException(status_code=400, detail="Give this routine at least one task before racing.")

    match = Match(
        code=generate_match_code(),
        creator_id=profile.id,
        routine_id=routine.id,
        routine_name=routine.name,
        status="waiting",
    )
    db.add(match)
    db.flush()

    for position, task in enumerate(tasks):
        db.add(MatchTask(match_id=match.id, title=task.title, position=position))

    db.add(
        MatchPlayer(
            match_id=match.id,
            user_id=profile.id,
            elo_before=profile.elo,
            joined_at=datetime.now(timezone.utc),
        )
    )
    db.commit()
    db.refresh(match)
    return match


def _join_match(db: Session, match: Match, profile: Profile) -> Match:
    if len(match.players) >= 2:
        raise HTTPException(status_code=409, detail="That race is already full.")
    if any(player.user_id == profile.id for player in match.players):
        return match

    db.add(
        MatchPlayer(
            match_id=match.id,
            user_id=profile.id,
            elo_before=profile.elo,
            joined_at=datetime.now(timezone.utc),
        )
    )
    match.status = "active"
    match.started_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(match)
    return match


def _get_match(db: Session, match_id: int, user_id: str) -> Match:
    match = db.get(Match, match_id)
    if not match:
        raise HTTPException(status_code=404, detail="Race not found.")
    if not any(player.user_id == user_id for player in match.players):
        raise HTTPException(status_code=403, detail="You are not part of this race.")
    return match


# --------------------------------------------------------------------------- #
# Endpoints
# --------------------------------------------------------------------------- #
@router.get("/active", response_model=MatchOut | None)
def active_match(
    profile: Profile = Depends(get_current_profile),
    db: Session = Depends(get_db),
) -> dict | None:
    match = _open_match_for(db, profile.id)
    return serialize_match(db, match, profile.id) if match else None


@router.post("/queue", response_model=MatchOut)
def queue(
    payload: QueueRequest,
    profile: Profile = Depends(get_current_profile),
    db: Session = Depends(get_db),
) -> dict:
    """Auto-match against the closest waiting opponent, otherwise open a race."""
    existing = _open_match_for(db, profile.id)
    if existing:
        return serialize_match(db, existing, profile.id)

    if payload.routine_id is not None:
        routine = (
            db.query(Routine)
            .filter(Routine.id == payload.routine_id, Routine.user_id == profile.id)
            .one_or_none()
        )
        if not routine:
            raise HTTPException(status_code=404, detail="Routine not found.")
    else:
        routine = (
            db.query(Routine)
            .filter(Routine.user_id == profile.id)
            .order_by(Routine.created_at.asc())
            .first()
        )
        if not routine:
            raise HTTPException(status_code=400, detail="Create a routine before entering ranked mode.")

    opponents = (
        db.query(Match, MatchPlayer)
        .join(MatchPlayer, MatchPlayer.match_id == Match.id)
        .filter(
            Match.status == "waiting",
            Match.creator_id != profile.id,
            MatchPlayer.user_id != profile.id,
        )
        .all()
    )
    candidates = [
        (match, abs(rank_for(player.elo_before).min_elo - rank_for(profile.elo).min_elo))
        for match, player in opponents
        if abs(player.elo_before - profile.elo) <= ELO_MATCH_WINDOW
    ]
    if candidates:
        candidates.sort(key=lambda pair: pair[1])
        return serialize_match(db, _join_match(db, candidates[0][0], profile), profile.id)

    return serialize_match(db, _make_match(db, profile, routine), profile.id)


@router.post("/join", response_model=MatchOut)
def join_by_code(
    payload: MatchJoinRequest,
    profile: Profile = Depends(get_current_profile),
    db: Session = Depends(get_db),
) -> dict:
    code = payload.code.strip().upper()
    match = db.query(Match).filter(Match.code == code).one_or_none()
    if not match:
        raise HTTPException(status_code=404, detail="No race found with that code.")
    if match.status == "finished":
        raise HTTPException(status_code=409, detail="That race has already finished.")

    existing = _open_match_for(db, profile.id)
    if existing and existing.id != match.id:
        raise HTTPException(status_code=409, detail="Finish your current race first.")

    return serialize_match(db, _join_match(db, match, profile), profile.id)


@router.get("/matches/{match_id}", response_model=MatchOut)
def read_match(
    match_id: int,
    profile: Profile = Depends(get_current_profile),
    db: Session = Depends(get_db),
) -> dict:
    return serialize_match(db, _get_match(db, match_id, profile.id), profile.id)


@router.delete("/matches/{match_id}", response_model=MatchOut)
def leave_match(
    match_id: int,
    profile: Profile = Depends(get_current_profile),
    db: Session = Depends(get_db),
) -> dict:
    """Cancel a waiting race, or forfeit an active one."""
    match = _get_match(db, match_id, profile.id)
    if match.status == "finished":
        return serialize_match(db, match, profile.id)

    me = next(player for player in match.players if player.user_id == profile.id)
    opponent = next((p for p in match.players if p.user_id != profile.id), None)

    if match.status == "waiting" or opponent is None:
        db.delete(match)
        db.commit()
        return {
            "id": match_id,
            "code": match.code,
            "status": "cancelled",
            "routine_name": match.routine_name,
            "created_at": match.created_at.isoformat(),
            "started_at": None,
            "finished_at": None,
            "winner_id": None,
            "tasks": [],
            "players": [],
            "you_finished": False,
            "you_won": False,
        }

    # Forfeit: hand the win to the opponent.
    now = datetime.now(timezone.utc)
    me.finished_at = None
    match.status = "finished"
    match.winner_id = opponent.user_id
    match.finished_at = now

    from ..economy import (
        RANKED_LOSS_COINS,
        RANKED_LOSS_ELO,
        RANKED_WIN_COINS,
        RANKED_WIN_ELO,
        apply_rewards,
    )

    for player, won in ((opponent, True), (me, False)):
        target = db.get(Profile, player.user_id)
        if not target:
            continue
        coins, elo = (RANKED_WIN_COINS, RANKED_WIN_ELO) if won else (RANKED_LOSS_COINS, RANKED_LOSS_ELO)
        apply_rewards(db, target, coins=coins, elo=elo, reason="Ranked race forfeit")
        target.matches_played = (target.matches_played or 0) + 1
        if won:
            target.matches_won = (target.matches_won or 0) + 1
        player.coins_won = coins
        player.elo_delta = elo
        player.elo_before = target.elo - elo
        player.elo_after = target.elo

    db.commit()
    db.refresh(match)
    return serialize_match(db, match, profile.id)


@router.post("/matches/{match_id}/proof", response_model=ProofVerificationOut)
async def submit_match_proof(
    match_id: int,
    match_task_id: int = Form(...),
    file: UploadFile = File(...),
    note: str | None = Form(default=None),
    profile: Profile = Depends(get_current_profile),
    db: Session = Depends(get_db),
) -> dict:
    """Upload the photo evidence for one checklist item of the race."""
    match = _get_match(db, match_id, profile.id)
    if match.status != "active":
        raise HTTPException(
            status_code=409,
            detail="The race is not running yet - wait for an opponent to join.",
        )

    match_task = (
        db.query(MatchTask)
        .filter(MatchTask.id == match_task_id, MatchTask.match_id == match.id)
        .one_or_none()
    )
    if not match_task:
        raise HTTPException(status_code=404, detail="That checklist item is not part of this race.")

    already = (
        db.query(Proof)
        .filter(
            Proof.match_id == match.id,
            Proof.match_task_id == match_task.id,
            Proof.user_id == profile.id,
            Proof.status == "approved",
        )
        .first()
    )
    if already:
        raise HTTPException(status_code=400, detail="That item is already verified for this race.")

    data = await file.read()
    try:
        image_path, mime = save_proof_image(data, profile.id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    result = verify_photo(data, claimed=match_task.title, routine_name=match.routine_name, content_type=mime, extra=note)

    proof = Proof(
        user_id=profile.id,
        match_id=match.id,
        match_task_id=match_task.id,
        claimed=f"{match.routine_name}: {match_task.title}",
        image_path=image_path,
        status="pending",
    )
    db.add(proof)
    db.flush()

    outcome = finalize_proof(db, profile, proof, result)
    if outcome.match:
        db.refresh(outcome.match)

    return {
        "proof": serialize_proof(db, proof),
        "approved": outcome.approved,
        "coins_awarded": outcome.coins_awarded,
        "elo_awarded": outcome.elo_awarded,
        "match_id": match.id,
        "reward": outcome.reward.as_dict() if outcome.reward else None,
        "match": serialize_match(db, outcome.match, profile.id) if outcome.match else None,
    }


@router.get("/leaderboard")
def ranked_leaderboard(
    limit: int = 50,
    profile: Profile = Depends(get_current_profile),
    db: Session = Depends(get_db),
) -> dict:
    """Compact ELO ladder used by the ranked screen."""
    limit = max(1, min(limit, 100))
    rows = (
        db.query(Profile)
        .filter(Profile.username.isnot(None))
        .order_by(Profile.elo.desc(), Profile.coins.desc())
        .limit(limit)
        .all()
    )
    return {
        "generated_on": today().isoformat(),
        "entries": [
            {
                "position": index + 1,
                "user_id": row.id,
                "username": row.username,
                "avatar_slug": row.avatar_slug,
                "avatar_url": public_url(row.avatar_path) if row.avatar_path else None,
                "elo": row.elo,
                "rank_name": rank_for(row.elo).name,
                "rank_color": rank_for(row.elo).color,
                "coins": row.coins,
                "matches_won": row.matches_won,
                "streak": row.streak,
                "is_you": row.id == profile.id,
            }
            for index, row in enumerate(rows)
        ],
    }


@router.get("/verification")
def verification_status() -> dict:
    """Lets the UI explain how photos are being judged."""
    return {
        "provider": settings.vision_provider,
        "automatic": settings.vision_provider in {"mock", "openai"},
        "auto_approve": settings.auto_approve_proofs if settings.vision_provider == "mock" else None,
        "reviewers": bool(settings.admin_email_set),
    }
