"""Routine ownership and scheduling rules shared by user and admin routes."""

from __future__ import annotations

from datetime import date

from fastapi import HTTPException
from sqlalchemy.orm import Session

from ..models import Routine, Task, TaskCompletion
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


def task_schedule_key(task: Task) -> tuple[int, int, int]:
    """Chronological key used by both the checklist UI and completion guard.

    Position and id keep the order deterministic when two rows somehow share a
    time. Invalid legacy times sort after the rest of the day.
    """
    minutes = _minutes_since_midnight(task.scheduled_time or "09:00")
    return (
        _MINUTES_PER_DAY if minutes is None else minutes,
        task.position or 0,
        task.id,
    )


def ensure_sequential_completion(
    db: Session,
    routine: Routine,
    target: Task,
    user_id: str,
    day: date,
) -> None:
    """Reject a check-in while an earlier task in the same routine is open.

    This is deliberately server-side: hiding the checkbox in the browser is not
    enough, because the task endpoint can still be called directly.
    """
    target_key = task_schedule_key(target)
    earlier = [task for task in routine.tasks if task_schedule_key(task) < target_key]
    if not earlier:
        return

    completed_ids = {
        row[0]
        for row in db.query(TaskCompletion.task_id)
        .filter(
            TaskCompletion.user_id == user_id,
            TaskCompletion.done_on == day,
            TaskCompletion.task_id.in_([task.id for task in earlier]),
        )
        .all()
    }

    for task in earlier:
        if task.id not in completed_ids:
            raise HTTPException(
                status_code=409,
                detail=(
                    f"Complete '{task.title}' first. Tasks must be checked in the "
                    "order they are scheduled."
                ),
            )


def ensure_single_routine_started(
    db: Session,
    routine: Routine,
    user_id: str,
    day: date,
) -> None:
    """Only the routine a user starts first may be checked in on a given day.

    Starting a task commits the day to that routine. Every other routine is
    locked until its tasks have no completions left, which stops users from
    earning timing ELO by checking in several routines for the same day.
    """
    started = first_started_routine(db, user_id, day)
    if started is None or started[0] == routine.id:
        return
    _, started_name = started
    raise HTTPException(
        status_code=409,
        detail=(
            f"Only one routine can be checked in per day. Finish '{started_name}' "
            "before starting another routine."
        ),
    )


def first_started_routine(
    db: Session,
    user_id: str,
    day: date,
) -> tuple[int, str] | None:
    """Return the routine with the day's earliest completion, if there is one."""
    row = (
        db.query(Routine.id, Routine.name)
        .join(Task, Task.routine_id == Routine.id)
        .join(TaskCompletion, TaskCompletion.task_id == Task.id)
        .filter(
            TaskCompletion.user_id == user_id,
            TaskCompletion.done_on == day,
        )
        .order_by(TaskCompletion.created_at.asc(), TaskCompletion.id.asc())
        .first()
    )
    if row is None:
        return None
    return int(row[0]), str(row[1])


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
            f"The first routine needs at least {MIN_TASK_GAP_MINUTES} minutes between "
            f"tasks. '{new_task.title.strip()}' at {new_task.scheduled_time} is too close "
            f"to '{other_title}' at {other_time}{location}."
        ),
    )


def ensure_task_spacing(
    db: Session,
    user_id: str,
    new_tasks: list[TaskIn],
    *,
    routine_id: int | None = None,
    exclude_task_id: int | None = None,
) -> None:
    """Keep 30-minute spacing only inside the user's first routine.

    The first routine is the account's original day plan. Additional routines
    can belong to other days, so they are allowed to overlap it and can use any
    times, including tasks less than 30 minutes apart.
    """
    first_routine = (
        db.query(Routine)
        .filter(Routine.user_id == user_id)
        .order_by(Routine.created_at.asc(), Routine.id.asc())
        .first()
    )

    if first_routine is None:
        # Creating the very first routine: honour the spacing rule inside it.
        for index, new_task in enumerate(new_tasks):
            for other in new_tasks[:index]:
                gap = _clock_gap_minutes(new_task.scheduled_time, other.scheduled_time)
                if gap is not None and gap < MIN_TASK_GAP_MINUTES:
                    _raise_task_spacing_error(new_task, other.title, other.scheduled_time)
        return

    if routine_id is None or routine_id != first_routine.id:
        return

    existing = db.query(Task).filter(Task.routine_id == first_routine.id).all()

    for new_task in new_tasks:
        for existing_task in existing:
            if existing_task.id == exclude_task_id:
                continue
            existing_time = existing_task.scheduled_time or "09:00"
            gap = _clock_gap_minutes(new_task.scheduled_time, existing_time)
            if gap is not None and gap < MIN_TASK_GAP_MINUTES:
                _raise_task_spacing_error(
                    new_task,
                    existing_task.title,
                    existing_time,
                    first_routine.name,
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
