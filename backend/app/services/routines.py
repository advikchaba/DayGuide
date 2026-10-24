"""Routine ownership and scheduling rules shared by user and admin routes."""

from __future__ import annotations

from fastapi import HTTPException
from sqlalchemy.orm import Session

from ..models import Routine, Task
from ..schemas import TaskIn

MIN_TASK_GAP_MINUTES = 30
_MINUTES_PER_DAY = 24 * 60


def _minutes_since_midnight(hhmm: str) -> int | None:
    try:
        hours, minutes = hhmm.split(":")
        hour = int(hours)
        minute = int(minutes)
    except (AttributeError, ValueError):
        return None
    if not (0 <= hour <= 23 and 0 <= minute <= 59):
        return None
    return hour * 60 + minute


def _clock_gap_minutes(first: str, second: str) -> int | None:
    """Shortest gap between two wall-clock times, wrapping across midnight."""
    first_minutes = _minutes_since_midnight(first)
    second_minutes = _minutes_since_midnight(second)
    if first_minutes is None or second_minutes is None:
        return None
    difference = abs(first_minutes - second_minutes)
    return min(difference, _MINUTES_PER_DAY - difference)


def _raise_task_spacing_error(
    new_task: TaskIn,
    other_title: str,
    other_time: str,
    other_routine: str | None = None,
) -> None:
    location = f" in '{other_routine}'" if other_routine else ""
    raise HTTPException(
        status_code=400,
        detail=(
            f"Tasks need at least {MIN_TASK_GAP_MINUTES} minutes between them. "
            f"'{new_task.title.strip()}' at {new_task.scheduled_time} is too close to "
            f"'{other_title}' at {other_time}{location}."
        ),
    )


def ensure_task_spacing(
    db: Session,
    user_id: str,
    new_tasks: list[TaskIn],
    *,
    exclude_task_id: int | None = None,
) -> None:
    """Reject schedules that would put any two of a user's tasks under 30 min apart.

    The check spans every routine, so a user cannot dodge it by splitting
    minute-by-minute tasks across several routines.
    """
    existing = (
        db.query(Task, Routine)
        .join(Routine, Routine.id == Task.routine_id)
        .filter(Routine.user_id == user_id)
        .all()
    )

    for new_task in new_tasks:
        for existing_task, existing_routine in existing:
            if existing_task.id == exclude_task_id:
                continue
            existing_time = existing_task.scheduled_time or "09:00"
            gap = _clock_gap_minutes(new_task.scheduled_time, existing_time)
            if gap is not None and gap < MIN_TASK_GAP_MINUTES:
                _raise_task_spacing_error(
                    new_task,
                    existing_task.title,
                    existing_time,
                    existing_routine.name,
                )

    for index, new_task in enumerate(new_tasks):
        for other in new_tasks[:index]:
            gap = _clock_gap_minutes(new_task.scheduled_time, other.scheduled_time)
            if gap is not None and gap < MIN_TASK_GAP_MINUTES:
                _raise_task_spacing_error(new_task, other.title, other.scheduled_time)


def get_owned_routine(db: Session, routine_id: int, user_id: str) -> Routine:
    routine = (
        db.query(Routine)
        .filter(Routine.id == routine_id, Routine.user_id == user_id)
        .one_or_none()
    )
    if not routine:
        raise HTTPException(status_code=404, detail="Routine not found.")
    return routine


def get_owned_task(db: Session, task_id: int, user_id: str) -> tuple[Task, Routine]:
    row = (
        db.query(Task, Routine)
        .join(Routine, Routine.id == Task.routine_id)
        .filter(Task.id == task_id, Routine.user_id == user_id)
        .one_or_none()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Task not found.")
    task, routine = row
    return task, routine
