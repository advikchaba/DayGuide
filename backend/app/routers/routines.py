"""Routine + task endpoints: the daily checklist and its rewards."""

from __future__ import annotations

from fastapi import APIRouter, Depends, File, Form, HTTPException, Response, UploadFile, status
from sqlalchemy.orm import Session

from ..auth import get_current_profile
from ..database import get_db
from ..economy import (
    COINS_PER_TASK,
    PERFECT_ROUTINE_COINS,
    PERFECT_ROUTINE_ELO,
    apply_rewards,
    completed_task_ids,
    evaluate_perfect_day,
    revoke_perfect_day,
    routine_progress,
    today,
)
from ..models import Profile, Proof, Routine, Task, TaskCompletion
from ..schemas import (
    ProofVerificationOut,
    RoutineIn,
    RoutineUpdate,
    TaskCompleteOut,
    TaskIn,
)
from ..serializers import serialize_proof, serialize_routine
from ..services.proofs import finalize_proof
from ..services.storage import save_proof_image
from ..services.vision import verify_photo

router = APIRouter(tags=["routines"])


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #
def _own_routine(db: Session, routine_id: int, user_id: str) -> Routine:
    routine = (
        db.query(Routine)
        .filter(Routine.id == routine_id, Routine.user_id == user_id)
        .one_or_none()
    )
    if not routine:
        raise HTTPException(status_code=404, detail="Routine not found.")
    return routine


def _own_task(db: Session, task_id: int, user_id: str) -> tuple[Task, Routine]:
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


def _reward_payload(reward, profile: Profile) -> dict:
    payload = reward.as_dict()
    payload["new_balance"] = profile.coins
    payload["new_elo"] = profile.elo
    return payload


# --------------------------------------------------------------------------- #
# Routines
# --------------------------------------------------------------------------- #
@router.get("/routines")
def list_routines(
    profile: Profile = Depends(get_current_profile),
    db: Session = Depends(get_db),
) -> list[dict]:
    routines = (
        db.query(Routine)
        .filter(Routine.user_id == profile.id)
        .order_by(Routine.created_at.asc())
        .all()
    )
    return [serialize_routine(db, routine, profile.id) for routine in routines]


@router.post("/routines", status_code=status.HTTP_201_CREATED)
def create_routine(
    payload: RoutineIn,
    profile: Profile = Depends(get_current_profile),
    db: Session = Depends(get_db),
) -> dict:
    if not payload.tasks:
        raise HTTPException(status_code=400, detail="Add at least one task to your routine.")

    routine = Routine(user_id=profile.id, name=payload.name.strip(), emoji=payload.emoji or "✅")
    db.add(routine)
    db.flush()

    for position, task in enumerate(payload.tasks):
        db.add(
            Task(
                routine_id=routine.id,
                title=task.title.strip(),
                note=task.note,
                requires_proof=task.requires_proof,
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
    routine = _own_routine(db, routine_id, profile.id)
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
    routine = _own_routine(db, routine_id, profile.id)
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
    profile: Profile = Depends(get_current_profile),
    db: Session = Depends(get_db),
) -> dict:
    routine = _own_routine(db, routine_id, profile.id)
    position = max((task.position for task in routine.tasks), default=-1) + 1
    db.add(
        Task(
            routine_id=routine.id,
            title=payload.title.strip(),
            note=payload.note,
            requires_proof=payload.requires_proof,
            coin_value=payload.coin_value,
            position=position,
        )
    )
    db.commit()
    db.refresh(routine)
    return serialize_routine(db, routine, profile.id)


@router.patch("/tasks/{task_id}")
def update_task(
    task_id: int,
    payload: TaskIn,
    profile: Profile = Depends(get_current_profile),
    db: Session = Depends(get_db),
) -> dict:
    task, routine = _own_task(db, task_id, profile.id)
    task.title = payload.title.strip()
    task.note = payload.note
    task.requires_proof = payload.requires_proof
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
    task, _routine = _own_task(db, task_id, profile.id)
    db.delete(task)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# --------------------------------------------------------------------------- #
# Completion
# --------------------------------------------------------------------------- #
@router.post("/tasks/{task_id}/complete", response_model=TaskCompleteOut)
def complete_task(
    task_id: int,
    profile: Profile = Depends(get_current_profile),
    db: Session = Depends(get_db),
) -> dict:
    task, routine = _own_task(db, task_id, profile.id)
    day = today()

    existing = (
        db.query(TaskCompletion)
        .filter(
            TaskCompletion.task_id == task.id,
            TaskCompletion.user_id == profile.id,
            TaskCompletion.done_on == day,
        )
        .one_or_none()
    )

    reward = None
    if not existing:
        coins = max(COINS_PER_TASK, task.coin_value)
        db.add(
            TaskCompletion(
                task_id=task.id,
                user_id=profile.id,
                done_on=day,
                source="manual",
                coins_awarded=coins,
            )
        )
        profile.tasks_completed = (profile.tasks_completed or 0) + 1
        apply_rewards(db, profile, coins=coins, reason=f"Task complete: {task.title}")
        reward = evaluate_perfect_day(db, profile, routine)
        reward.base_coins = coins
        db.commit()
        db.refresh(profile)
    else:
        reward = evaluate_perfect_day(db, profile, routine)
        db.commit()

    db.refresh(routine)
    return {
        "task_id": task.id,
        "completed": True,
        "routine": serialize_routine(db, routine, profile.id),
        "reward": _reward_payload(reward, profile),
    }


@router.delete("/tasks/{task_id}/complete", response_model=TaskCompleteOut)
def uncomplete_task(
    task_id: int,
    profile: Profile = Depends(get_current_profile),
    db: Session = Depends(get_db),
) -> dict:
    """Un-tick a task: reverses the coins it granted (anti-farming)."""
    from ..economy import DayReward, rank_for

    task, routine = _own_task(db, task_id, profile.id)
    day = today()

    existing = (
        db.query(TaskCompletion)
        .filter(
            TaskCompletion.task_id == task.id,
            TaskCompletion.user_id == profile.id,
            TaskCompletion.done_on == day,
        )
        .one_or_none()
    )

    reverted = 0
    if existing:
        reverted += existing.coins_awarded
        apply_rewards(db, profile, coins=-existing.coins_awarded, reason=f"Task unchecked: {task.title}")
        profile.tasks_completed = max(0, (profile.tasks_completed or 0) - 1)
        db.delete(existing)
        db.flush()

    reverted += revoke_perfect_day(db, profile, routine)
    db.commit()
    db.refresh(profile)
    db.refresh(routine)

    rank = rank_for(profile.elo)
    reward = DayReward(
        coins=-reverted,
        streak=profile.streak,
        rank_name=rank.name,
        rank_progress=rank.progress,
    )
    return {
        "task_id": task.id,
        "completed": False,
        "routine": serialize_routine(db, routine, profile.id),
        "reward": _reward_payload(reward, profile),
    }


# --------------------------------------------------------------------------- #
# Photo proof for a routine task
# --------------------------------------------------------------------------- #
@router.post("/tasks/{task_id}/proof", response_model=ProofVerificationOut)
async def submit_task_proof(
    task_id: int,
    file: UploadFile = File(..., description="Photo evidence for this task"),
    note: str | None = Form(default=None),
    profile: Profile = Depends(get_current_profile),
    db: Session = Depends(get_db),
) -> dict:
    task, routine = _own_task(db, task_id, profile.id)
    data = await file.read()

    try:
        image_path, mime = save_proof_image(data, profile.id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    claimed = f"{routine.name}: {task.title}"
    result = verify_photo(
        data,
        claimed=task.title,
        routine_name=routine.name,
        content_type=mime,
        extra=note,
    )

    proof = Proof(
        user_id=profile.id,
        task_id=task.id,
        claimed=claimed,
        image_path=image_path,
        status="pending",
    )
    db.add(proof)
    db.flush()

    outcome = finalize_proof(db, profile, proof, result)
    db.refresh(routine)

    return {
        "proof": serialize_proof(db, proof),
        "approved": outcome.approved,
        "coins_awarded": outcome.coins_awarded,
        "elo_awarded": outcome.elo_awarded,
        "task_id": task.id,
        "reward": _reward_payload(outcome.reward, profile) if outcome.reward else None,
        "routine": serialize_routine(db, routine, profile.id) if outcome.routine else None,
    }
