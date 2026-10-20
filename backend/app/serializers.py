"""Turning ORM rows into API payloads (shared by every router)."""

from __future__ import annotations

from datetime import datetime, time, timedelta, timezone

from sqlalchemy.orm import Session

from .economy import completed_task_ids, rank_for, routine_progress, today
from .models import Match, MatchPlayer, PerfectDay, Profile, Proof, Routine, Task
from .services.storage import public_url


# --------------------------------------------------------------------------- #
# Routines
# --------------------------------------------------------------------------- #
def _today_proof_status(db: Session, task_ids: list[int], user_id: str) -> dict[int, str]:
    """Latest proof status per task for today (range filter = portable SQL)."""
    if not task_ids:
        return {}

    start = datetime.combine(today(), time.min, tzinfo=timezone.utc)
    end = start + timedelta(days=1)

    rows = (
        db.query(Proof)
        .filter(
            Proof.user_id == user_id,
            Proof.task_id.in_(task_ids),
            Proof.created_at >= start,
            Proof.created_at < end,
        )
        .order_by(Proof.created_at.asc())
        .all()
    )
    statuses: dict[int, str] = {}
    for proof in rows:
        if proof.task_id is not None:
            statuses[proof.task_id] = proof.status
    return statuses


def serialize_task(task: Task, done_ids: set[int], proof_status: dict[int, str]) -> dict:
    return {
        "id": task.id,
        "title": task.title,
        "note": task.note,
        "requires_proof": task.requires_proof,
        "coin_value": task.coin_value,
        "position": task.position,
        "completed_today": task.id in done_ids,
        "proof_status": proof_status.get(task.id),
    }


def serialize_routine(db: Session, routine: Routine, user_id: str) -> dict:
    done_ids = completed_task_ids(db, user_id)
    task_ids = [task.id for task in routine.tasks]
    statuses = _today_proof_status(db, task_ids, user_id)
    progress = routine_progress(db, routine, user_id)
    perfect = (
        db.query(PerfectDay)
        .filter(
            PerfectDay.user_id == user_id,
            PerfectDay.routine_id == routine.id,
            PerfectDay.done_on == today(),
        )
        .one_or_none()
        is not None
    )
    return {
        "id": routine.id,
        "name": routine.name,
        "emoji": routine.emoji,
        "created_at": routine.created_at.isoformat(),
        "tasks": [serialize_task(task, done_ids, statuses) for task in routine.tasks],
        "total": progress["total"],
        "done": progress["done"],
        "percent": progress["percent"],
        "perfect_today": perfect,
    }


# --------------------------------------------------------------------------- #
# Matches
# --------------------------------------------------------------------------- #
def _player_progress(db: Session, match_id: int, user_id: str) -> tuple[int, dict[int, str]]:
    proofs = (
        db.query(Proof)
        .filter(Proof.match_id == match_id, Proof.user_id == user_id)
        .order_by(Proof.created_at.asc())
        .all()
    )
    statuses: dict[int, str] = {}
    approved: set[int] = set()
    for proof in proofs:
        if proof.match_task_id is None:
            continue
        statuses[proof.match_task_id] = proof.status
        if proof.status == "approved":
            approved.add(proof.match_task_id)
    return len(approved), statuses


def serialize_match(db: Session, match: Match, viewer_id: str) -> dict:
    total = len(match.tasks)
    _, statuses = _player_progress(db, match.id, viewer_id)

    players = []
    for player in match.players:
        profile = db.get(Profile, player.user_id)
        progress, _ = _player_progress(db, match.id, player.user_id)
        players.append(
            {
                "user_id": player.user_id,
                "username": profile.username if profile else None,
                "avatar_slug": profile.avatar_slug if profile else "spark",
                "rank_name": rank_for(player.elo_before).name,
                "elo": player.elo_after if player.elo_after is not None else player.elo_before,
                "progress": progress,
                "total": total,
                "finished": player.finished_at is not None,
                "is_you": player.user_id == viewer_id,
                "elo_delta": player.elo_delta,
                "coins_won": player.coins_won,
            }
        )

    return {
        "id": match.id,
        "code": match.code,
        "status": match.status,
        "routine_name": match.routine_name,
        "created_at": match.created_at.isoformat(),
        "started_at": match.started_at.isoformat() if match.started_at else None,
        "finished_at": match.finished_at.isoformat() if match.finished_at else None,
        "winner_id": match.winner_id,
        "tasks": [
            {
                "id": task.id,
                "title": task.title,
                "position": task.position,
                "approved": statuses.get(task.id) == "approved",
                "proof_status": statuses.get(task.id),
            }
            for task in match.tasks
        ],
        "players": players,
        "you_finished": any(p["is_you"] and p["finished"] for p in players),
        "you_won": match.winner_id == viewer_id,
    }


# --------------------------------------------------------------------------- #
# Proofs
# --------------------------------------------------------------------------- #
def serialize_proof(db: Session, proof: Proof) -> dict:
    db.flush()
    profile = db.get(Profile, proof.user_id)
    return {
        "id": proof.id,
        "status": proof.status,
        "confidence": round(proof.confidence, 3),
        "reason": proof.reason,
        "reviewer": proof.reviewer,
        "claimed": proof.claimed,
        "image_url": public_url(proof.image_path),
        "coins_awarded": proof.coins_awarded,
        "created_at": proof.created_at.isoformat(),
        "user_id": proof.user_id,
        "username": profile.username if profile else None,
    }


def player_summary(player: MatchPlayer) -> dict:
    return {
        "user_id": player.user_id,
        "progress": player.progress,
        "elo_delta": player.elo_delta,
        "coins_won": player.coins_won,
    }
