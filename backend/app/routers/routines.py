"""Routine + task endpoints: the daily checklist and its timing rewards."""

from __future__ import annotations

from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.orm import Session

from ..auth import get_current_profile
from ..database import get_db
from ..economy import (
    COINS_PER_TASK,
    DayReward,
    apply_rewards,
    evaluate_perfect_day,
    rank_for,
    revoke_perfect_day,
    timing_reward,
    today,
)
from ..models import LateTaskPass, Profile, Routine, Task, TaskCompletion
from ..schemas import CompletionIn, LatePassRequest, RoutineIn, RoutineUpdate, TaskCompleteOut, TaskIn
from ..serializers import serialize_routine
from ..services.routines import (
    ensure_sequential_completion,
    ensure_single_routine_started,
    ensure_task_spacing,
    get_owned_routine,
    get_owned_task,
)

router = APIRouter(tags=["routines"])


def _reward_payload(reward: DayReward, profile: Profile) -> dict:
    payload = reward.as_dict()
    payload["new_balance"] = profile.coins
    payload["new_elo"] = profile.elo
    return payload


def _local_time(payload: CompletionIn | None) -> str:
    if payload and payload.local_time:
        return payload.local_time
    return datetime.now(timezone.utc).strftime("%H:%M")


# --------------------------------------------------------------------------- #
# Routines
# --------------------------------------------------------------------------- #
@router.get("/routines")
def list_routines(
    local_date: date | None = Query(default=None),
    profile: Profile = Depends(get_current_profile),
    db: Session = Depends(get_db),
) -> list[dict]:
    routines = (
        db.query(Routine)
        .filter(Routine.user_id == profile.id)
        .order_by(Routine.created_at.asc(), Routine.id.asc())
        .all()
    )
    day = local_date or today()
    return [serialize_routine(db, routine, profile.id, day) for routine in routines]


@router.post("/routines", status_code=status.HTTP_201_CREATED)
def create_routine(
    payload: RoutineIn,
    profile: Profile = Depends(get_current_profile),
    db: Session = Depends(get_db),
) -> dict:
    if not payload.tasks:
        raise HTTPException(status_code=400, detail="Add at least one task to your routine.")

    ensure_task_spacing(db, profile.id, payload.tasks)

    routine = Routine(user_id=profile.id, name=payload.name.strip(), emoji=payload.emoji or "")
    db.add(routine)
    db.flush()

    for position, task in enumerate(payload.tasks):
        db.add(
            Task(
                routine_id=routine.id,
                title=task.title.strip(),
                note=task.note,
                requires_proof=False,
                scheduled_time=task.scheduled_time,
                coin_value=task.coin_value,
                position=position,
            )
        )
    db.commit()
    db.refresh(routine)
    return serialize_routine(db, routine, profile.id)


@router.patch("/routines/{routine_id}")
def update_routine(
    routine_id: int,
    payload: RoutineUpdate,
    profile: Profile = Depends(get_current_profile),
    db: Session = Depends(get_db),
) -> dict:
    routine = get_owned_routine(db, routine_id, profile.id)
    if payload.name is not None:
        routine.name = payload.name.strip()
    if payload.emoji is not None:
        routine.emoji = payload.emoji
    db.commit()
    db.refresh(routine)
    return serialize_routine(db, routine, profile.id)


@router.delete("/routines/{routine_id}", status_code=status.HTTP_204_NO_CONTENT, response_class=Response)
def delete_routine(
    routine_id: int,
    profile: Profile = Depends(get_current_profile),
    db: Session = Depends(get_db),
) -> Response:
    routine = get_owned_routine(db, routine_id, profile.id)
    db.delete(routine)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# --------------------------------------------------------------------------- #
# Tasks
# --------------------------------------------------------------------------- #
@router.post("/routines/{routine_id}/tasks", status_code=status.HTTP_201_CREATED)
def add_task(
    routine_id: int,
    payload: TaskIn,
    local_date: date | None = Query(default=None),
    profile: Profile = Depends(get_current_profile),
    db: Session = Depends(get_db),
) -> dict:
    routine = get_owned_routine(db, routine_id, profile.id)
    ensure_task_spacing(db, profile.id, [payload], routine_id=routine.id)
    position = max((task.position for task in routine.tasks), default=-1) + 1
    db.add(
        Task(
            routine_id=routine.id,
            title=payload.title.strip(),
            note=payload.note,
            requires_proof=False,
            scheduled_time=payload.scheduled_time,
            coin_value=payload.coin_value,
            position=position,
        )
    )
    db.commit()
    db.refresh(routine)
    day = local_date or today()
    return serialize_routine(db, routine, profile.id, day)


@router.patch("/tasks/{task_id}")
def update_task(
    task_id: int,
    payload: TaskIn,
    profile: Profile = Depends(get_current_profile),
    db: Session = Depends(get_db),
) -> dict:
    task, routine = get_owned_task(db, task_id, profile.id)
    if payload.scheduled_time != task.scheduled_time:
        ensure_task_spacing(
            db,
            profile.id,
            [payload],
            routine_id=routine.id,
            exclude_task_id=task.id,
        )
    task.title = payload.title.strip()
    task.note = payload.note
    task.requires_proof = False
    task.scheduled_time = payload.scheduled_time
    task.coin_value = payload.coin_value
    db.commit()
    db.refresh(routine)
    return serialize_routine(db, routine, profile.id)


@router.delete("/tasks/{task_id}", status_code=status.HTTP_204_NO_CONTENT, response_class=Response)
def delete_task(
    task_id: int,
    profile: Profile = Depends(get_current_profile),
    db: Session = Depends(get_db),
) -> Response:
    task, _routine = get_owned_task(db, task_id, profile.id)
    db.delete(task)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# --------------------------------------------------------------------------- #
# Auto-check missed tasks
# --------------------------------------------------------------------------- #
LATE_PASS_COST = 1000


def _minutes(hhmm: str) -> int | None:
    try:
        h, m = hhmm.split(":")
        return int(h) * 60 + int(m)
    except Exception:
        return None


@router.post("/tasks/auto-check")
def auto_check_missed_tasks(
    profile: Profile = Depends(get_current_profile),
    db: Session = Depends(get_db),
) -> dict:
    """Mark missed tasks as completed and deduct ELO.

    Tasks scheduled more than 20 minutes ago that have no completion are
    auto-checked with -40 ELO. Tasks that are 4-5 minutes past the window
    (24-25 minutes late) give the user an option to pay 1000 coins to avoid
    the deduction instead.
    """
    day = today()
    routines = (
        db.query(Routine)
        .filter(Routine.user_id == profile.id)
        .all()
    )
    tasks = []
    for routine in routines:
        for task in routine.tasks:
            tasks.append(task)

    processed = []

    for task in tasks:
        scheduled = task.scheduled_time or "09:00"
        scheduled_minutes = _minutes(scheduled)
        if scheduled_minutes is None:
            continue

        now = datetime.now(timezone.utc)
        now_minutes = now.hour * 60 + now.minute
        diff_minutes = now_minutes - scheduled_minutes
        if diff_minutes < 20:
            continue

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
            continue

        late_pass = (
            db.query(LateTaskPass)
            .filter(LateTaskPass.user_id == profile.id, LateTaskPass.task_id == task.id)
            .one_or_none()
        )
        if late_pass:
            continue

        # 4-5 minutes past window: offer pay option instead of auto penalty
        if 24 <= diff_minutes <= 25:
            processed.append(
                {
                    "task_id": task.id,
                    "title": task.title,
                    "scheduled_time": scheduled,
                    "minutes_late": diff_minutes,
                    "action": "pay_option",
                    "cost": LATE_PASS_COST,
                    "detail": "You are 4-5 minutes past the window. Pay 1000 coins to avoid -40 ELO.",
                }
            )
            continue

        # Auto-check with -40 ELO
        profile.tasks_completed = (profile.tasks_completed or 0) + 1
        apply_rewards(db, profile, coins=0, elo=-40, reason=f"Missed task: {task.title}")

        db.add(
            TaskCompletion(
                task_id=task.id,
                user_id=profile.id,
                done_on=day,
                source="auto",
                coins_awarded=0,
                elo_awarded=-40,
                on_time=False,
                time_delta_minutes=diff_minutes,
            )
        )
        processed.append(
            {
                "task_id": task.id,
                "title": task.title,
                "scheduled_time": scheduled,
                "minutes_late": diff_minutes,
                "action": "auto_checked",
                "elo_delta": -40,
                "detail": "Task auto-checked: -40 ELO for missing the 20 minute window.",
            }
        )

    db.commit()
    db.refresh(profile)
    return {"processed": processed}


@router.post("/tasks/late-pass")
def purchase_late_pass(
    payload: LatePassRequest,
    profile: Profile = Depends(get_current_profile),
    db: Session = Depends(get_db),
) -> dict:
    """Pay 1000 coins to avoid -40 ELO for a late task (4-5 min past window)."""
    task = db.get(Task, payload.task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found.")
    routine = db.get(Routine, task.routine_id)
    if not routine or routine.user_id != profile.id:
        raise HTTPException(status_code=404, detail="Task not found.")

    scheduled = task.scheduled_time or "09:00"
    scheduled_minutes = _minutes(scheduled)
    now = datetime.now(timezone.utc)
    now_minutes = now.hour * 60 + now.minute
    diff_minutes = now_minutes - scheduled_minutes

    if not (24 <= diff_minutes <= 25):
        raise HTTPException(status_code=400, detail="Late pass is only available 4-5 minutes past the window.")

    existing = (
        db.query(LateTaskPass)
        .filter(LateTaskPass.user_id == profile.id, LateTaskPass.task_id == task.id)
        .one_or_none()
    )
    if existing:
        raise HTTPException(status_code=409, detail="Late pass already purchased for this task.")

    if profile.coins < LATE_PASS_COST:
        raise HTTPException(status_code=400, detail=f"You need {LATE_PASS_COST} coins to buy a late pass.")

    from ..database import select_for_update

    locked = select_for_update(db.query(Profile).filter(Profile.id == profile.id), db).one()
    if locked.coins < LATE_PASS_COST:
        raise HTTPException(status_code=400, detail="Insufficient coins.")

    apply_rewards(db, locked, coins=-LATE_PASS_COST, reason="Late task pass")
    db.add(
        LateTaskPass(user_id=locked.id, task_id=task.id, paid_at=datetime.now(timezone.utc), coins_paid=LATE_PASS_COST)
    )
    db.commit()

    return {"detail": "Late pass purchased. ELO deduction avoided.", "coins_paid": LATE_PASS_COST}
@router.post("/tasks/{task_id}/complete", response_model=TaskCompleteOut)
def complete_task(
    task_id: int,
    payload: CompletionIn | None = None,
    profile: Profile = Depends(get_current_profile),
    db: Session = Depends(get_db),
) -> dict:
    task, routine = get_owned_task(db, task_id, profile.id)
    day = (payload.local_date if payload else None) or today()
    scheduled_time = task.scheduled_time or "09:00"

    existing = (
        db.query(TaskCompletion)
        .filter(
            TaskCompletion.task_id == task.id,
            TaskCompletion.user_id == profile.id,
            TaskCompletion.done_on == day,
        )
        .one_or_none()
    )

    if not existing:
        ensure_single_routine_started(db, routine, profile.id, day)
        ensure_sequential_completion(db, routine, task, profile.id, day)

        actual_time = _local_time(payload)
        on_time, difference, elo = timing_reward(scheduled_time, actual_time)
        coins = max(COINS_PER_TASK, task.coin_value) if on_time else 0

        profile.tasks_completed = (profile.tasks_completed or 0) + 1
        reason = (
            f"Task on time: {task.title}"
            if on_time
            else f"Task off schedule ({difference} min): {task.title}"
        )
        applied_coins, applied_elo = apply_rewards(
            db, profile, coins=coins, elo=elo, reason=reason
        )

        db.add(
            TaskCompletion(
                task_id=task.id,
                user_id=profile.id,
                done_on=day,
                source="manual",
                coins_awarded=applied_coins,
                elo_awarded=applied_elo,
                on_time=on_time,
                time_delta_minutes=difference,
            )
        )

        reward = evaluate_perfect_day(db, profile, routine, day)
        reward.base_coins = applied_coins
        reward.coins += applied_coins
        reward.elo += applied_elo
        reward.on_time = on_time
        reward.time_delta_minutes = difference
        reward.scheduled_time = scheduled_time
        if on_time:
            message = f"On time ({difference} min off): +{applied_coins} coins, +{applied_elo} ELO"
            if applied_elo < elo:
                message += " (ELO ceiling reached)"
        else:
            message = f"{difference} min off schedule: {applied_elo} ELO, no coins"
            if applied_elo > elo:
                message += " (ELO floor reached)"
        reward.messages.insert(0, message)
        db.commit()
        db.refresh(profile)
    else:
        reward = evaluate_perfect_day(db, profile, routine, day)
        reward.on_time = existing.on_time
        reward.time_delta_minutes = existing.time_delta_minutes
        reward.scheduled_time = scheduled_time
        reward.messages.insert(0, "Already ticked for this day.")
        db.commit()

    db.refresh(routine)
    return {
        "task_id": task.id,
        "completed": True,
        "routine": serialize_routine(db, routine, profile.id, day),
        "reward": _reward_payload(reward, profile),
    }


@router.delete("/tasks/{task_id}/complete", response_model=TaskCompleteOut)
def uncomplete_task(
    task_id: int,
    local_date: date | None = Query(default=None),
    profile: Profile = Depends(get_current_profile),
    db: Session = Depends(get_db),
) -> dict:
    """Un-tick a task: reverses both the coins and the ELO it granted."""
    task, routine = get_owned_task(db, task_id, profile.id)
    day = local_date or today()

    existing = (
        db.query(TaskCompletion)
        .filter(
            TaskCompletion.task_id == task.id,
            TaskCompletion.user_id == profile.id,
            TaskCompletion.done_on == day,
        )
        .one_or_none()
    )

    reverted_coins = 0
    reverted_elo = 0
    if existing:
        applied_coins, applied_elo = apply_rewards(
            db,
            profile,
            coins=-existing.coins_awarded,
            elo=-existing.elo_awarded,
            reason=f"Task unchecked: {task.title}",
        )
        reverted_coins -= applied_coins
        reverted_elo -= applied_elo
        profile.tasks_completed = max(0, (profile.tasks_completed or 0) - 1)
        db.delete(existing)
        db.flush()

    perfect_coins, perfect_elo = revoke_perfect_day(db, profile, routine, day)
    reverted_coins += perfect_coins
    reverted_elo += perfect_elo
    db.commit()
    db.refresh(profile)
    db.refresh(routine)

    rank = rank_for(profile.elo)
    reward = DayReward(
        coins=-reverted_coins,
        elo=-reverted_elo,
        streak=profile.streak,
        rank_name=rank.name,
        rank_progress=rank.progress,
        scheduled_time=task.scheduled_time or "09:00",
        messages=[
            "Task unchecked - its coins and ELO were reversed."
            if existing
            else "Task was not ticked for this day."
        ],
    )
    return {
        "task_id": task.id,
        "completed": False,
        "routine": serialize_routine(db, routine, profile.id, day),
        "reward": _reward_payload(reward, profile),
    }
