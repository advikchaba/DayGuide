"""Proof lifecycle: verification, rewards and match settlement.

Both the automatic verifier and the human review queue funnel through
:func:`finalize_proof`, so a proof is rewarded exactly once no matter who
approves it.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from ..economy import (
    COINS_PER_VERIFIED_TASK,
    PROOF_QUALITY_BONUS,
    RANKED_LOSS_COINS,
    RANKED_LOSS_ELO,
    RANKED_WIN_COINS,
    RANKED_WIN_ELO,
    DayReward,
    apply_rewards,
    evaluate_perfect_day,
    rank_for,
    today,
)
from ..models import Match, MatchPlayer, Profile, Proof, Routine, Task, TaskCompletion
from .vision import VerificationResult

logger = logging.getLogger("routinery.proofs")


@dataclass
class ProofOutcome:
    proof: Proof
    approved: bool
    coins_awarded: int = 0
    elo_awarded: int = 0
    routine: Routine | None = None
    match: Match | None = None
    reward: DayReward | None = None


# --------------------------------------------------------------------------- #
# Routine proofs
# --------------------------------------------------------------------------- #
def _complete_task_from_proof(
    db: Session,
    profile: Profile,
    task: Task,
    proof: Proof,
    confidence: float,
) -> tuple[int, int]:
    """Mark the task done for today and return ``(coins, elo)`` awarded."""
    day = today()
    coins = COINS_PER_VERIFIED_TASK + (PROOF_QUALITY_BONUS if confidence >= 0.8 else 0)

    existing = (
        db.query(TaskCompletion)
        .filter(
            TaskCompletion.task_id == task.id,
            TaskCompletion.user_id == profile.id,
            TaskCompletion.done_on == day,
        )
        .one_or_none()
    )

    if existing:
        if existing.source == "proof":
            return 0, 0  # already rewarded today, never pay twice
        # Upgrade a manual tick to a verified one and pay only the difference.
        delta = max(0, coins - existing.coins_awarded)
        existing.source = "proof"
        existing.coins_awarded += delta
        existing.proof_id = proof.id
        if delta:
            apply_rewards(db, profile, coins=delta, reason=f"Photo verified: {task.title}")
        return delta, 0

    db.add(
        TaskCompletion(
            task_id=task.id,
            user_id=profile.id,
            done_on=day,
            source="proof",
            coins_awarded=coins,
            proof_id=proof.id,
        )
    )
    profile.tasks_completed = (profile.tasks_completed or 0) + 1
    apply_rewards(db, profile, coins=coins, reason=f"Photo verified: {task.title}")
    return coins, 0


# --------------------------------------------------------------------------- #
# Ranked match proofs
# --------------------------------------------------------------------------- #
def _settle_match(db: Session, match: Match) -> None:
    """End the race once a player has every task verified."""
    if match.status != "active" or len(match.players) < 2:
        return

    db.flush()
    finishers = sorted(
        (p for p in match.players if p.finished_at is not None),
        key=lambda p: p.finished_at,
    )
    if not finishers:
        return

    winner = finishers[0]
    match.status = "finished"
    match.winner_id = winner.user_id
    match.finished_at = winner.finished_at

    for player in match.players:
        profile = db.get(Profile, player.user_id)
        if not profile:
            continue
        player.elo_before = profile.elo

        if player.user_id == winner.user_id:
            coins, elo = RANKED_WIN_COINS, RANKED_WIN_ELO
            reason = f"Ranked win vs {len(match.players) - 1} player(s)"
            profile.matches_won = (profile.matches_won or 0) + 1
        else:
            coins, elo = RANKED_LOSS_COINS, RANKED_LOSS_ELO
            reason = "Ranked loss - checklist not finished in time"

        apply_rewards(db, profile, coins=coins, elo=elo, reason=reason)
        profile.matches_played = (profile.matches_played or 0) + 1
        player.coins_won = coins
        player.elo_delta = elo
        player.elo_after = profile.elo

    logger.info("Match %s finished, winner=%s", match.code, match.winner_id)


def _advance_match(db: Session, match: Match, player: MatchPlayer, total: int) -> None:
    # Make sure the proof we just marked approved is visible to the counters.
    db.flush()
    approved, _ = _player_progress(db, match.id, player.user_id)
    player.progress = approved
    if total and approved >= total and player.finished_at is None:
        player.finished_at = datetime.now(timezone.utc)

    _settle_match(db, match)


def _player_progress(db: Session, match_id: int, user_id: str) -> tuple[int, dict[int, str]]:
    proofs = (
        db.query(Proof)
        .filter(Proof.match_id == match_id, Proof.user_id == user_id, Proof.status == "approved")
        .all()
    )
    approved = {p.match_task_id for p in proofs if p.match_task_id is not None}
    return len(approved), {}


# --------------------------------------------------------------------------- #
# Entry point
# --------------------------------------------------------------------------- #
def finalize_proof(
    db: Session,
    profile: Profile,
    proof: Proof,
    result: VerificationResult,
    *,
    reviewer: str = "auto",
) -> ProofOutcome:
    proof.status = result.status
    proof.confidence = max(0.0, min(1.0, result.confidence))
    proof.reason = result.reason[:380]
    proof.reviewer = reviewer
    proof.reviewed_at = datetime.now(timezone.utc)

    outcome = ProofOutcome(proof=proof, approved=result.status == "approved")
    if not outcome.approved:
        db.commit()
        db.refresh(proof)
        return outcome

    # --- routine task proof ------------------------------------------------
    if proof.task_id is not None:
        task = db.get(Task, proof.task_id)
        routine = db.get(Routine, task.routine_id) if task else None
        if task and routine:
            coins, elo = _complete_task_from_proof(db, profile, task, proof, proof.confidence)
            proof.coins_awarded = coins
            outcome.coins_awarded = coins
            outcome.elo_awarded = elo
            outcome.routine = routine

            streak_reward = evaluate_perfect_day(db, profile, routine)
            if streak_reward.perfect:
                outcome.reward = streak_reward
                outcome.coins_awarded += streak_reward.coins
                outcome.elo_awarded += streak_reward.elo

    # --- ranked match proof ------------------------------------------------
    if proof.match_id is not None:
        match = db.get(Match, proof.match_id)
        if match and match.status == "active":
            player = (
                db.query(MatchPlayer)
                .filter(MatchPlayer.match_id == match.id, MatchPlayer.user_id == profile.id)
                .one_or_none()
            )
            if player:
                _advance_match(db, match, player, len(match.tasks))
                outcome.match = match

    db.commit()
    db.refresh(proof)

    if outcome.reward is None:
        rank = rank_for(profile.elo)
        outcome.reward = DayReward(
            coins=outcome.coins_awarded,
            elo=outcome.elo_awarded,
            streak=profile.streak,
            rank_name=rank.name,
            rank_progress=rank.progress,
        )
    return outcome


def unreward_proof(db: Session, proof: Proof) -> None:
    """Used by the review queue when a human reverses an auto-approval."""
    if proof.coins_awarded:
        profile = db.get(Profile, proof.user_id)
        if profile:
            apply_rewards(db, profile, coins=-proof.coins_awarded, reason="Proof reversed by review")
        proof.coins_awarded = 0
    proof.status = "rejected"
    db.commit()
