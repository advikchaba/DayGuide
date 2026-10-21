"""The economy: ELO ranks, coin payouts and the reward pipeline.

Every number in this module is tuned by the product spec and is the single
source of truth for the API and the frontend.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import func
from sqlalchemy.orm import Session

from .database import select_for_update
from .models import LedgerEntry, PerfectDay, Profile, Routine, Task, TaskCompletion

# --------------------------------------------------------------------------- #
# Constants
# --------------------------------------------------------------------------- #
MIN_ELO = 100
MAX_ELO = 2400

RANK_TIERS: tuple[tuple[str, int, int, str], ...] = (
    ("Copper", 100, 500, "#B87333"),
    ("Bronze", 500, 800, "#8C5A2B"),
    ("Silver", 800, 1200, "#BFC5CC"),
    ("Gold", 1200, 1600, "#E0B020"),
    ("Platinum", 1600, 2000, "#2C7A7B"),
    ("Ruby", 2000, 2400, "#C41E3A"),
)

# --- routine rewards -------------------------------------------------------
COINS_PER_TASK = 10            # ticking a task on time
COINS_PER_VERIFIED_TASK = 25   # legacy photo reward (kept for dormant proof code)
PROOF_QUALITY_BONUS = 10       # extra coins when the model is very confident
PERFECT_ROUTINE_COINS = 200    # "200 coins every time they follow their routine perfectly"
PERFECT_ROUTINE_ELO = 0        # ELO is now awarded per task by timing accuracy

# --- timing rewards --------------------------------------------------------
ON_TIME_WINDOW_MINUTES = 20    # inside this window a check-in is "on time"
ON_TIME_ELO_MAX = 50           # exact timing
ON_TIME_ELO_MIN = 45           # 20 minutes off
LATE_ELO_MIN = 10              # just outside the window
LATE_ELO_MAX = 30              # 120+ minutes off
LATE_PENALTY_RAMP_MINUTES = 100  # minutes from 20 -> 120 to reach the max penalty

# --- ranked rewards --------------------------------------------------------
RANKED_WIN_ELO = 50
RANKED_WIN_COINS = 200
RANKED_FINISH_ELO = 15         # finished the list but was second
RANKED_FINISH_COINS = 60
RANKED_LOSS_ELO = -15          # never finished the list
RANKED_LOSS_COINS = 10

# --- cosmetics -------------------------------------------------------------
USERNAME_CHANGE_COST = 400
STARTING_COINS = 100


@dataclass(frozen=True)
class Rank:
    name: str
    min_elo: int
    max_elo: int
    color: str
    progress: float = 0.0
    elo_to_next: int = 0

    @property
    def is_max(self) -> bool:
        return self.min_elo >= MAX_ELO


def rank_for(elo: int) -> Rank:
    """Map an ELO value onto the published tier ladder."""
    clamped = max(MIN_ELO, min(MAX_ELO, elo))
    for index, (name, low, high, color) in enumerate(RANK_TIERS):
        if clamped < high or index == len(RANK_TIERS) - 1:
            span = max(1, high - low)
            progress = max(0.0, min(1.0, (clamped - low) / span))
            return Rank(
                name=name,
                min_elo=low,
                max_elo=high,
                color=color,
                progress=round(progress, 4),
                elo_to_next=max(0, high - clamped),
            )
    # unreachable, keeps type checkers happy
    name, low, high, color = RANK_TIERS[-1]
    return Rank(name=name, min_elo=low, max_elo=high, color=color, progress=1.0, elo_to_next=0)


def clamp_elo(elo: int) -> int:
    return max(MIN_ELO, min(MAX_ELO, elo))


def today() -> date:
    return datetime.now(timezone.utc).date()


# --------------------------------------------------------------------------- #
# Timing
# --------------------------------------------------------------------------- #
def parse_hhmm(value: str | None) -> int | None:
    """Return minutes since midnight for a ``HH:MM`` string, or None."""
    if not value:
        return None
    try:
        hours_text, minutes_text = value.strip().split(":")
        hours, minutes = int(hours_text), int(minutes_text)
    except (AttributeError, ValueError):
        return None
    if 0 <= hours <= 23 and 0 <= minutes <= 59:
        return hours * 60 + minutes
    return None


def time_difference_minutes(scheduled: str | None, actual: str | None) -> int:
    """Shortest distance between two wall-clock times (handles midnight)."""
    scheduled_minutes = parse_hhmm(scheduled)
    actual_minutes = parse_hhmm(actual)
    if scheduled_minutes is None or actual_minutes is None:
        return 0
    difference = abs(scheduled_minutes - actual_minutes)
    return min(difference, 24 * 60 - difference)


def timing_reward(scheduled: str | None, actual: str | None) -> tuple[bool, int, int]:
    """Score a check-in against its scheduled time.

    Returns ``(on_time, difference_minutes, elo_delta)``.
    Inside the 20 minute window the reward is +50 down to +45 ELO. Outside it
    the penalty is -10 down to -30 ELO as the gap grows to two hours.
    """
    difference = time_difference_minutes(scheduled, actual)
    if difference <= ON_TIME_WINDOW_MINUTES:
        span = ON_TIME_ELO_MAX - ON_TIME_ELO_MIN
        gain = round(ON_TIME_ELO_MAX - span * (difference / ON_TIME_WINDOW_MINUTES))
        return True, difference, max(ON_TIME_ELO_MIN, gain)

    over = difference - ON_TIME_WINDOW_MINUTES
    ratio = min(over / LATE_PENALTY_RAMP_MINUTES, 1.0)
    penalty = round(LATE_ELO_MIN + (LATE_ELO_MAX - LATE_ELO_MIN) * ratio)
    return False, difference, -penalty


# --------------------------------------------------------------------------- #
# Ledger + profile mutation helpers
# --------------------------------------------------------------------------- #
def apply_rewards(
    db: Session,
    profile: Profile,
    *,
    coins: int = 0,
    elo: int = 0,
    reason: str,
) -> tuple[int, int]:
    """Move coins/ELO on a profile and write the matching ledger entry.

    Returns the deltas that were actually applied. Both values are clamped
    (coins at zero, ELO to the published floor/ceiling), so callers that need
    to reverse a reward later must store these values rather than the request.
    """
    coins_before = profile.coins
    elo_before = profile.elo

    if coins:
        profile.coins = max(0, profile.coins + coins)
    if elo:
        profile.elo = clamp_elo(profile.elo + elo)

    applied_coins = profile.coins - coins_before
    applied_elo = profile.elo - elo_before
    if applied_coins or applied_elo:
        db.add(
            LedgerEntry(
                user_id=profile.id,
                delta=applied_coins,
                elo_delta=applied_elo,
                reason=reason,
            )
        )
    return applied_coins, applied_elo


def lock_profile(db: Session, user_id: str) -> Profile | None:
    query = select_for_update(db.query(Profile).filter(Profile.id == user_id), db)
    return query.one_or_none()


# --------------------------------------------------------------------------- #
# Routine completion pipeline
# --------------------------------------------------------------------------- #
@dataclass
class DayReward:
    """Everything the client needs to animate a reward moment."""

    coins: int = 0
    elo: int = 0
    base_coins: int = 0
    perfect_coins: int = 0
    perfect_elo: int = 0
    perfect: bool = False
    streak: int = 0
    rank_name: str = ""
    rank_progress: float = 0.0
    on_time: bool = True
    time_delta_minutes: int = 0
    scheduled_time: str | None = None
    messages: list[str] = field(default_factory=list)

    def as_dict(self) -> dict:
        return {
            "coins": self.coins,
            "elo": self.elo,
            "base_coins": self.base_coins,
            "perfect_coins": self.perfect_coins,
            "perfect_elo": self.perfect_elo,
            "perfect": self.perfect,
            "streak": self.streak,
            "rank_name": self.rank_name,
            "rank_progress": self.rank_progress,
            "on_time": self.on_time,
            "time_delta_minutes": self.time_delta_minutes,
            "scheduled_time": self.scheduled_time,
            "messages": self.messages,
        }


def _count_tasks(db: Session, routine_id: int) -> int:
    return (
        db.query(func.count(Task.id)).filter(Task.routine_id == routine_id).scalar() or 0
    )


def _count_completed(db: Session, routine_id: int, user_id: str, day: date) -> int:
    return (
        db.query(func.count(TaskCompletion.id))
        .join(Task, Task.id == TaskCompletion.task_id)
        .filter(Task.routine_id == routine_id)
        .filter(TaskCompletion.user_id == user_id, TaskCompletion.done_on == day)
        .scalar()
        or 0
    )


def _count_on_time(db: Session, routine_id: int, user_id: str, day: date) -> int:
    return (
        db.query(func.count(TaskCompletion.id))
        .join(Task, Task.id == TaskCompletion.task_id)
        .filter(Task.routine_id == routine_id)
        .filter(
            TaskCompletion.user_id == user_id,
            TaskCompletion.done_on == day,
            TaskCompletion.on_time.is_(True),
        )
        .scalar()
        or 0
    )


def routine_progress(db: Session, routine: Routine, user_id: str, day: date | None = None) -> dict:
    """Cheap progress summary used by the routine endpoints."""
    day = day or today()
    total = len(routine.tasks) or _count_tasks(db, routine.id)
    done = _count_completed(db, routine.id, user_id, day)
    return {"total": total, "done": done, "percent": round((done / total * 100) if total else 0.0, 1)}


def completed_task_ids(db: Session, user_id: str, day: date | None = None) -> set[int]:
    day = day or today()
    rows = (
        db.query(TaskCompletion.task_id)
        .filter(TaskCompletion.user_id == user_id, TaskCompletion.done_on == day)
        .all()
    )
    return {row[0] for row in rows}


def evaluate_perfect_day(
    db: Session,
    profile: Profile,
    routine: Routine,
    day: date | None = None,
) -> DayReward:
    """Award the "perfect routine" bonus when every task of a routine is done.

    Idempotent: the ``perfect_days`` unique constraint guarantees one payout per
    routine per day even if the client calls this repeatedly.
    """
    day = day or today()
    reward = DayReward()

    # The session runs with autoflush disabled, so make sure any completion the
    # caller just added is visible to the counters below.
    db.flush()

    total = _count_tasks(db, routine.id)
    done = _count_completed(db, routine.id, profile.id, day)
    on_time = _count_on_time(db, routine.id, profile.id, day)

    reward.streak = profile.streak
    if total == 0 or done < total or on_time < total:
        rank = rank_for(profile.elo)
        reward.rank_name, reward.rank_progress = rank.name, rank.progress
        return reward

    already = (
        db.query(PerfectDay)
        .filter(
            PerfectDay.user_id == profile.id,
            PerfectDay.routine_id == routine.id,
            PerfectDay.done_on == day,
        )
        .one_or_none()
    )
    if already:
        reward.perfect = True
        rank = rank_for(profile.elo)
        reward.rank_name, reward.rank_progress = rank.name, rank.progress
        return reward

    # Streak: consecutive calendar days with at least one perfect routine.
    last = profile.last_perfect_on
    if last == day:
        pass
    elif last == day - timedelta(days=1):
        profile.streak = (profile.streak or 0) + 1
    else:
        profile.streak = 1
    profile.best_streak = max(profile.best_streak or 0, profile.streak)
    profile.last_perfect_on = day
    profile.routines_completed = (profile.routines_completed or 0) + 1

    streak_bonus = min(profile.streak - 1, 10) * 5  # up to 50 extra coins
    coins = PERFECT_ROUTINE_COINS + streak_bonus
    elo = PERFECT_ROUTINE_ELO

    apply_rewards(db, profile, coins=coins, elo=elo, reason=f"Perfect routine: {routine.name}")
    db.add(
        PerfectDay(
            user_id=profile.id,
            routine_id=routine.id,
            done_on=day,
            coins_awarded=coins,
            elo_awarded=elo,
        )
    )

    rank = rank_for(profile.elo)
    reward.coins = coins
    reward.elo = elo
    reward.perfect_coins = coins
    reward.perfect_elo = elo
    reward.perfect = True
    reward.streak = profile.streak
    reward.rank_name = rank.name
    reward.rank_progress = rank.progress
    reward.messages.append(f"Perfect routine! +{coins} coins")
    if streak_bonus:
        reward.messages.append(f"{profile.streak} day streak: +{streak_bonus} bonus coins")
    return reward


def revoke_perfect_day(
    db: Session,
    profile: Profile,
    routine: Routine,
    day: date | None = None,
) -> tuple[int, int]:
    """Undo a perfect-day payout (used when a task is unchecked the same day).

    Returns the ``(coins, elo)`` that were reversed.
    """
    day = day or today()
    row = (
        db.query(PerfectDay)
        .filter(
            PerfectDay.user_id == profile.id,
            PerfectDay.routine_id == routine.id,
            PerfectDay.done_on == day,
        )
        .one_or_none()
    )
    if not row:
        return 0, 0

    coins = row.coins_awarded
    elo = row.elo_awarded
    applied_coins, applied_elo = apply_rewards(
        db,
        profile,
        coins=-coins,
        elo=-elo,
        reason=f"Routine bonus reverted: {routine.name}",
    )
    profile.routines_completed = max(0, (profile.routines_completed or 0) - 1)
    db.delete(row)
    return -applied_coins, -applied_elo
