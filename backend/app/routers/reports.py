"""Reports: task, timing and reward summaries over rolling windows."""

from __future__ import annotations

from datetime import date, timedelta
from typing import Literal

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from ..auth import get_current_profile
from ..database import get_db
from ..economy import today
from ..models import PerfectDay, Profile, Routine, TaskCompletion

router = APIRouter(tags=["reports"])

PeriodKey = Literal["3d", "week", "month"]

# ``month`` is a rolling 30-day window, matching the "last month" label.
PERIODS: dict[str, tuple[int, str]] = {
    "3d": (3, "Last 3 days"),
    "week": (7, "Weekly"),
    "month": (30, "Last month"),
}


def _date_range(start: date, end: date) -> list[date]:
    return [start + timedelta(days=offset) for offset in range((end - start).days + 1)]


def _summarize(completions: list[TaskCompletion], perfect_days: list[PerfectDay]) -> dict:
    tasks = len(completions)
    on_time = sum(1 for completion in completions if completion.on_time)
    coins = sum(completion.coins_awarded for completion in completions) + sum(
        perfect.coins_awarded for perfect in perfect_days
    )
    elo = sum(completion.elo_awarded for completion in completions) + sum(
        perfect.elo_awarded for perfect in perfect_days
    )
    active_days = len(
        {completion.done_on for completion in completions}
        | {perfect.done_on for perfect in perfect_days}
    )
    average_delta = (
        round(sum(completion.time_delta_minutes for completion in completions) / tasks, 1)
        if tasks
        else 0.0
    )
    return {
        "tasks_completed": tasks,
        "tasks_on_time": on_time,
        "tasks_late": tasks - on_time,
        "on_time_rate": round((on_time / tasks) * 100, 1) if tasks else 0.0,
        "perfect_routines": len(perfect_days),
        "active_days": active_days,
        "coins_earned": coins,
        "elo_earned": elo,
        "average_delta_minutes": average_delta,
    }


def _daily_rows(
    start: date,
    end: date,
    completions: list[TaskCompletion],
    perfect_days: list[PerfectDay],
) -> list[dict]:
    rows = {
        day: {
            "date": day.isoformat(),
            "label": f"{day.strftime('%b')} {day.day}",
            "weekday": day.strftime("%a"),
            "tasks": 0,
            "on_time": 0,
            "late": 0,
            "perfect": 0,
            "coins": 0,
            "elo": 0,
        }
        for day in _date_range(start, end)
    }

    for completion in completions:
        row = rows.get(completion.done_on)
        if row is None:
            continue
        row["tasks"] += 1
        row["on_time"] += 1 if completion.on_time else 0
        row["late"] += 0 if completion.on_time else 1
        row["coins"] += completion.coins_awarded
        row["elo"] += completion.elo_awarded

    for perfect in perfect_days:
        row = rows.get(perfect.done_on)
        if row is None:
            continue
        row["perfect"] += 1
        row["coins"] += perfect.coins_awarded
        row["elo"] += perfect.elo_awarded

    for row in rows.values():
        row["on_time_rate"] = (
            round((row["on_time"] / row["tasks"]) * 100, 1) if row["tasks"] else 0.0
        )
    return list(rows.values())


def _best_day(daily: list[dict]) -> dict | None:
    active = [row for row in daily if row["tasks"] or row["perfect"]]
    if not active:
        return None
    best = max(
        reversed(active),
        key=lambda row: (row["tasks"], row["perfect"], row["coins"], row["elo"]),
    )
    return {
        key: best[key]
        for key in ("date", "label", "weekday", "tasks", "on_time", "perfect", "coins", "elo")
    }


def _routine_rows(
    routines: list[Routine],
    completions: list[TaskCompletion],
    perfect_days: list[PerfectDay],
) -> list[dict]:
    by_routine = {
        routine.id: {
            "id": routine.id,
            "name": routine.name,
            "tasks_completed": 0,
            "tasks_on_time": 0,
            "perfect_routines": 0,
            "coins_earned": 0,
            "elo_earned": 0,
        }
        for routine in routines
    }
    task_to_routine = {
        task.id: routine.id for routine in routines for task in routine.tasks
    }

    for completion in completions:
        routine_id = task_to_routine.get(completion.task_id)
        row = by_routine.get(routine_id) if routine_id is not None else None
        if row is None:
            continue
        row["tasks_completed"] += 1
        row["tasks_on_time"] += 1 if completion.on_time else 0
        row["coins_earned"] += completion.coins_awarded
        row["elo_earned"] += completion.elo_awarded

    for perfect in perfect_days:
        row = by_routine.get(perfect.routine_id)
        if row is None:
            continue
        row["perfect_routines"] += 1
        row["coins_earned"] += perfect.coins_awarded
        row["elo_earned"] += perfect.elo_awarded

    for row in by_routine.values():
        row["on_time_rate"] = (
            round((row["tasks_on_time"] / row["tasks_completed"]) * 100, 1)
            if row["tasks_completed"]
            else 0.0
        )

    return sorted(
        by_routine.values(),
        key=lambda row: (-row["tasks_completed"], row["name"].lower()),
    )


def _period_rows(
    db: Session,
    profile: Profile,
    start: date,
    end: date,
) -> tuple[list[TaskCompletion], list[PerfectDay]]:
    completions = (
        db.query(TaskCompletion)
        .filter(
            TaskCompletion.user_id == profile.id,
            TaskCompletion.done_on >= start,
            TaskCompletion.done_on <= end,
        )
        .all()
    )
    perfect_days = (
        db.query(PerfectDay)
        .filter(
            PerfectDay.user_id == profile.id,
            PerfectDay.done_on >= start,
            PerfectDay.done_on <= end,
        )
        .all()
    )
    return completions, perfect_days


@router.get("/reports")
def read_report(
    period: PeriodKey = Query(default="week", alias="range"),
    local_date: date | None = Query(default=None),
    profile: Profile = Depends(get_current_profile),
    db: Session = Depends(get_db),
) -> dict:
    """Return a rolling report for the last 3, 7 or 30 local days."""
    days, label = PERIODS[period]
    end = local_date or today()
    start = end - timedelta(days=days - 1)
    previous_end = start - timedelta(days=1)
    previous_start = previous_end - timedelta(days=days - 1)

    completions, perfect_days = _period_rows(db, profile, start, end)
    previous_completions, previous_perfect_days = _period_rows(
        db, profile, previous_start, previous_end
    )

    routines = (
        db.query(Routine)
        .filter(Routine.user_id == profile.id)
        .order_by(Routine.created_at.asc())
        .all()
    )
    daily = _daily_rows(start, end, completions, perfect_days)

    return {
        "range": period,
        "label": label,
        "start": start.isoformat(),
        "end": end.isoformat(),
        "days": days,
        "summary": _summarize(completions, perfect_days),
        "previous": _summarize(previous_completions, previous_perfect_days),
        "daily": daily,
        "routines": _routine_rows(routines, completions, perfect_days),
        "best_day": _best_day(daily),
        "streak": profile.streak,
        "best_streak": profile.best_streak,
    }
