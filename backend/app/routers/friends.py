"""Friends: search users, send/accept friend requests, common routines and duels."""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ..auth import get_current_profile
from ..database import get_db
from ..economy import apply_rewards, timing_reward, today
from ..services.storage import public_url
from ..models import (
    CommonRoutine,
    CommonRoutineTask,
    Duel,
    DuelPlayer,
    DuelTask,
    DuelTaskCompletion,
    Friend as FriendModel,
    LateTaskPass,
    Profile,
    Routine,
    Task,
    TaskCompletion,
)
from ..schemas import (
    CommonRoutineIn,
    CommonRoutineOut,
    CommonRoutineTaskIn,
    CommonRoutineTaskOut,
    DuelCreate,
    DuelOut,
    DuelPlayerOut,
    DuelTaskComplete,
    DuelTaskOut,
    FriendOut,
    FriendRequestOut,
    FriendSearchOut,
    LatePassRequest,
    SendFriendRequest,
)

router = APIRouter(prefix="/friends", tags=["friends"])

LATE_PASS_COST = 1000


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #
def _get_profile_by_username(db: Session, username: str) -> Profile:
    profile = (
        db.query(Profile)
        .filter(Profile.username == username.strip())
        .one_or_none()
    )
    if not profile:
        raise HTTPException(status_code=404, detail="User not found.")
    return profile


def _are_friends(db: Session, user_id: str, friend_id: str) -> FriendModel | None:
    return (
        db.query(FriendModel)
        .filter(
            FriendModel.user_id == user_id,
            FriendModel.friend_id == friend_id,
            FriendModel.status == "accepted",
        )
        .one_or_none()
    )


def _pending_request_between(db: Session, user_id: str, friend_id: str) -> FriendModel | None:
    return (
        db.query(FriendModel)
        .filter(
            ((FriendModel.user_id == user_id) & (FriendModel.friend_id == friend_id))
            | ((FriendModel.user_id == friend_id) & (FriendModel.friend_id == user_id)),
            FriendModel.status == "pending",
        )
        .one_or_none()
    )


def _serialize_friend(db: Session, row: FriendModel, viewer_id: str) -> dict:
    profile = db.get(Profile, row.friend_id)
    return {
        "id": row.id,
        "user_id": row.user_id,
        "friend_id": row.friend_id,
        "status": row.status,
        "created_at": row.created_at,
        "username": profile.username if profile else None,
        "avatar_slug": profile.avatar_slug if profile else None,
        "avatar_url": public_url(profile.avatar_path) if profile and profile.avatar_path else None,
        "elo": profile.elo if profile else None,
    }


# --------------------------------------------------------------------------- #
# Search
# --------------------------------------------------------------------------- #
@router.get("/search", response_model=list[FriendSearchOut])
def search_users(
    q: str = Query(min_length=1, max_length=20),
    profile: Profile = Depends(get_current_profile),
    db: Session = Depends(get_db),
) -> list[dict]:
    rows = (
        db.query(Profile)
        .filter(Profile.username.ilike(f"%{q.strip()}%"))
        .filter(Profile.id != profile.id)
        .limit(20)
        .all()
    )
    return [
        {
            "id": row.id,
            "username": row.username,
            "avatar_slug": row.avatar_slug,
            "avatar_url": public_url(row.avatar_path) if row.avatar_path else None,
            "elo": row.elo,
        }
        for row in rows
    ]


# --------------------------------------------------------------------------- #
# Friend requests
# --------------------------------------------------------------------------- #
@router.post("/request", response_model=FriendRequestOut)
def send_friend_request(
    payload: SendFriendRequest,
    profile: Profile = Depends(get_current_profile),
    db: Session = Depends(get_db),
) -> dict:
    target = _get_profile_by_username(db, payload.username)
    if target.id == profile.id:
        raise HTTPException(status_code=400, detail="You cannot send a request to yourself.")

    existing = _pending_request_between(db, profile.id, target.id)
    if existing:
        raise HTTPException(status_code=409, detail="A friend request already exists between you.")

    if _are_friends(db, profile.id, target.id):
        raise HTTPException(status_code=409, detail="You are already friends.")

    request = FriendModel(user_id=profile.id, friend_id=target.id, status="pending")
    db.add(request)
    db.commit()
    db.refresh(request)
    return {
        "id": request.id,
        "user_id": request.user_id,
        "friend_id": request.friend_id,
        "status": request.status,
        "created_at": request.created_at,
    }


@router.post("/requests/{request_id}/accept")
def accept_friend_request(
    request_id: int,
    profile: Profile = Depends(get_current_profile),
    db: Session = Depends(get_db),
) -> dict:
    request = db.get(FriendModel, request_id)
    if not request:
        raise HTTPException(status_code=404, detail="Friend request not found.")
    if request.friend_id != profile.id:
        raise HTTPException(status_code=403, detail="You are not the recipient of this request.")
    if request.status != "pending":
        raise HTTPException(status_code=409, detail="This request has already been resolved.")

    request.status = "accepted"
    db.commit()
    return {"id": request.id, "status": request.status}


@router.post("/requests/{request_id}/decline")
def decline_friend_request(
    request_id: int,
    profile: Profile = Depends(get_current_profile),
    db: Session = Depends(get_db),
) -> dict:
    request = db.get(FriendModel, request_id)
    if not request:
        raise HTTPException(status_code=404, detail="Friend request not found.")
    if request.friend_id != profile.id:
        raise HTTPException(status_code=403, detail="You are not the recipient of this request.")
    if request.status != "pending":
        raise HTTPException(status_code=409, detail="This request has already been resolved.")

    request.status = "declined"
    db.commit()
    return {"id": request.id, "status": request.status}


@router.get("/requests/pending", response_model=list[FriendRequestOut])
def pending_requests(
    profile: Profile = Depends(get_current_profile),
    db: Session = Depends(get_db),
) -> list[dict]:
    rows = (
        db.query(FriendModel)
        .filter(FriendModel.friend_id == profile.id, FriendModel.status == "pending")
        .order_by(FriendModel.created_at.desc())
        .all()
    )
    return [
        {
            "id": row.id,
            "user_id": row.user_id,
            "friend_id": row.friend_id,
            "status": row.status,
            "created_at": row.created_at,
        }
        for row in rows
    ]


@router.get("", response_model=list[FriendOut])
def list_friends(
    profile: Profile = Depends(get_current_profile),
    db: Session = Depends(get_db),
) -> list[dict]:
    rows = (
        db.query(FriendModel)
        .filter(FriendModel.user_id == profile.id, FriendModel.status == "accepted")
        .order_by(FriendModel.created_at.desc())
        .all()
    )
    return [_serialize_friend(db, row, profile.id) for row in rows]


@router.delete("/friends/{friend_id}")
def remove_friend(
    friend_id: str,
    profile: Profile = Depends(get_current_profile),
    db: Session = Depends(get_db),
) -> dict:
    row = (
        db.query(FriendModel)
        .filter(
            FriendModel.user_id == profile.id,
            FriendModel.friend_id == friend_id,
            FriendModel.status == "accepted",
        )
        .one_or_none()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Friend not found.")
    db.delete(row)
    db.commit()
    return {"detail": "Friend removed."}


# --------------------------------------------------------------------------- #
# Common routines
# --------------------------------------------------------------------------- #
@router.post("/common-routines", response_model=CommonRoutineOut)
def create_common_routine(
    payload: CommonRoutineIn,
    profile: Profile = Depends(get_current_profile),
    db: Session = Depends(get_db),
) -> dict:
    friend = _get_profile_by_username(db, payload.friend_username)
    if friend.id == profile.id:
        raise HTTPException(status_code=400, detail="You cannot create a common routine with yourself.")

    if not _are_friends(db, profile.id, friend.id):
        raise HTTPException(status_code=403, detail="You must be friends to create a common routine.")

    routine = CommonRoutine(
        creator_id=profile.id,
        friend_id=friend.id,
        name=payload.name.strip(),
        emoji=payload.emoji or "",
    )
    db.add(routine)
    db.flush()

    for position, task in enumerate(payload.tasks):
        db.add(
            CommonRoutineTask(
                common_routine_id=routine.id,
                title=task.title.strip(),
                note=task.note,
                scheduled_time=task.scheduled_time,
                position=position,
            )
        )

    db.commit()
    db.refresh(routine)
    return _serialize_common_routine(db, routine, profile.id)


@router.get("/common-routines", response_model=list[CommonRoutineOut])
def list_common_routines(
    profile: Profile = Depends(get_current_profile),
    db: Session = Depends(get_db),
) -> list[dict]:
    rows = (
        db.query(CommonRoutine)
        .filter(
            (CommonRoutine.creator_id == profile.id) | (CommonRoutine.friend_id == profile.id)
        )
        .order_by(CommonRoutine.created_at.desc())
        .all()
    )
    return [_serialize_common_routine(db, row, profile.id) for row in rows]


@router.get("/common-routines/{routine_id}", response_model=CommonRoutineOut)
def read_common_routine(
    routine_id: int,
    profile: Profile = Depends(get_current_profile),
    db: Session = Depends(get_db),
) -> dict:
    routine = db.get(CommonRoutine, routine_id)
    if not routine:
        raise HTTPException(status_code=404, detail="Common routine not found.")
    if routine.creator_id != profile.id and routine.friend_id != profile.id:
        raise HTTPException(status_code=403, detail="You are not part of this common routine.")
    return _serialize_common_routine(db, routine, profile.id)


# --------------------------------------------------------------------------- #
# Duels
# --------------------------------------------------------------------------- #
@router.post("/duels", response_model=DuelOut)
def create_duel(
    payload: DuelCreate,
    profile: Profile = Depends(get_current_profile),
    db: Session = Depends(get_db),
) -> dict:
    routine = db.get(CommonRoutine, payload.common_routine_id)
    if not routine:
        raise HTTPException(status_code=404, detail="Common routine not found.")
    if routine.creator_id != profile.id and routine.friend_id != profile.id:
        raise HTTPException(status_code=403, detail="You are not part of this common routine.")

    opponent_id = payload.opponent_id
    if opponent_id not in (routine.creator_id, routine.friend_id):
        raise HTTPException(status_code=403, detail="Opponent must be part of this common routine.")
    if opponent_id == profile.id:
        raise HTTPException(status_code=400, detail="You cannot duel yourself.")

    if not _are_friends(db, profile.id, opponent_id):
        raise HTTPException(status_code=403, detail="You must be friends to duel.")

    existing = (
        db.query(Duel)
        .filter(Duel.common_routine_id == routine.id, Duel.status.in_(("waiting", "active")))
        .one_or_none()
    )
    if existing:
        raise HTTPException(status_code=409, detail="A duel is already active for this routine.")

    challenger_id = profile.id
    opponent_id_actual = routine.friend_id if challenger_id == routine.creator_id else routine.creator_id
    if opponent_id != opponent_id_actual:
        raise HTTPException(status_code=400, detail="Invalid opponent for this common routine.")

    duel = Duel(
        common_routine_id=routine.id,
        challenger_id=challenger_id,
        opponent_id=opponent_id_actual,
        status="waiting",
    )
    db.add(duel)
    db.flush()

    for task in routine.tasks:
        db.add(DuelTask(duel_id=duel.id, title=task.title, scheduled_time=task.scheduled_time, position=task.position))

    db.add(DuelPlayer(duel_id=duel.id, user_id=challenger_id, joined_at=datetime.now(timezone.utc)))
    db.add(DuelPlayer(duel_id=duel.id, user_id=opponent_id_actual, joined_at=datetime.now(timezone.utc)))

    db.commit()
    db.refresh(duel)
    return _serialize_duel(db, duel, profile.id)


@router.get("/duels", response_model=list[DuelOut])
def list_duels(
    profile: Profile = Depends(get_current_profile),
    db: Session = Depends(get_db),
) -> list[dict]:
    rows = (
        db.query(Duel)
        .filter((Duel.challenger_id == profile.id) | (Duel.opponent_id == profile.id))
        .order_by(Duel.created_at.desc())
        .all()
    )
    return [_serialize_duel(db, row, profile.id) for row in rows]


@router.get("/duels/{duel_id}", response_model=DuelOut)
def read_duel(
    duel_id: int,
    profile: Profile = Depends(get_current_profile),
    db: Session = Depends(get_db),
) -> dict:
    duel = db.get(Duel, duel_id)
    if not duel:
        raise HTTPException(status_code=404, detail="Duel not found.")
    if duel.challenger_id != profile.id and duel.opponent_id != profile.id:
        raise HTTPException(status_code=403, detail="You are not part of this duel.")
    return _serialize_duel(db, duel, profile.id)


@router.post("/duels/{duel_id}/complete")
def complete_duel_task(
    duel_id: int,
    payload: DuelTaskComplete,
    profile: Profile = Depends(get_current_profile),
    db: Session = Depends(get_db),
) -> dict:
    duel = db.get(Duel, duel_id)
    if not duel:
        raise HTTPException(status_code=404, detail="Duel not found.")
    if duel.challenger_id != profile.id and duel.opponent_id != profile.id:
        raise HTTPException(status_code=403, detail="You are not part of this duel.")
    if duel.status != "active":
        raise HTTPException(status_code=409, detail="The duel is not active yet.")

    task = db.get(DuelTask, payload.duel_task_id)
    if not task or task.duel_id != duel.id:
        raise HTTPException(status_code=404, detail="Duel task not found.")

    existing = (
        db.query(DuelTaskCompletion)
        .filter(DuelTaskCompletion.duel_task_id == task.id, DuelTaskCompletion.user_id == profile.id)
        .one_or_none()
    )
    if existing:
        raise HTTPException(status_code=400, detail="Already completed this task in this duel.")

    scheduled_time = task.scheduled_time or "09:00"
    actual_time = payload.local_time or datetime.now(timezone.utc).strftime("%H:%M")
    on_time, difference, elo_delta = timing_reward(scheduled_time, actual_time)

    db.add(
        DuelTaskCompletion(
            duel_task_id=task.id,
            user_id=profile.id,
            local_time=actual_time,
            on_time=on_time,
            time_delta_minutes=difference,
            elo_delta=elo_delta,
        )
    )

    player = next((p for p in duel.players if p.user_id == profile.id), None)
    if player:
        player.finished_at = datetime.now(timezone.utc)

    # Check if both players finished all tasks
    all_tasks = [t.id for t in duel.tasks]
    completed_me = {
        c.duel_task_id
        for c in db.query(DuelTaskCompletion)
        .filter(DuelTaskCompletion.user_id == profile.id)
        .all()
    }
    opponent_id = duel.opponent_id if duel.challenger_id == profile.id else duel.challenger_id
    completed_opponent = {
        c.duel_task_id
        for c in db.query(DuelTaskCompletion)
        .filter(DuelTaskCompletion.user_id == opponent_id)
        .all()
    }

    both_finished = set(all_tasks) <= completed_me and set(all_tasks) <= completed_opponent
    if both_finished:
        duel.status = "finished"
        duel.finished_at = datetime.now(timezone.utc)
        _finalize_duel(db, duel)

    db.commit()
    db.refresh(duel)
    return _serialize_duel(db, duel, profile.id)


@router.post("/duels/{duel_id}/start")
def start_duel(
    duel_id: int,
    profile: Profile = Depends(get_current_profile),
    db: Session = Depends(get_db),
) -> dict:
    duel = db.get(Duel, duel_id)
    if not duel:
        raise HTTPException(status_code=404, detail="Duel not found.")
    if duel.challenger_id != profile.id and duel.opponent_id != profile.id:
        raise HTTPException(status_code=403, detail="You are not part of this duel.")
    if duel.status != "waiting":
        raise HTTPException(status_code=409, detail="The duel is not in waiting state.")

    duel.status = "active"
    duel.started_at = datetime.now(timezone.utc)

    for player in duel.players:
        player.elo_before = db.get(Profile, player.user_id).elo

    db.commit()
    db.refresh(duel)
    return _serialize_duel(db, duel, profile.id)


# --------------------------------------------------------------------------- #
# Internal helpers
# --------------------------------------------------------------------------- #
def _minutes(hhmm: str) -> int | None:
    try:
        h, m = hhmm.split(":")
        return int(h) * 60 + int(m)
    except Exception:
        return None


def _finalize_duel(db: Session, duel: Duel) -> None:
    """Calculate the duel winner and award ELO based on timing accuracy."""
    players = duel.players
    if len(players) != 2:
        return

    p1, p2 = players[0], players[1]
    prof1 = db.get(Profile, p1.user_id)
    prof2 = db.get(Profile, p2.user_id)

    def player_stats(player: DuelPlayer) -> tuple[int, int, int]:
        """(on_time_count, total_delta_minutes, total_elo_delta)"""
        completions = (
            db.query(DuelTaskCompletion)
            .filter(DuelTaskCompletion.user_id == player.user_id)
            .all()
        )
        on_time = sum(1 for c in completions if c.on_time)
        total_delta = sum(c.time_delta_minutes for c in completions)
        total_elo = sum(c.elo_delta for c in completions)
        return on_time, total_delta, total_elo

    on1, delta1, elo1 = player_stats(p1)
    on2, delta2, elo2 = player_stats(p2)

    # Winner: more on-time tasks wins; tie-break by smaller total delta
    if on1 > on2:
        winner_id = p1.user_id
    elif on2 > on1:
        winner_id = p2.user_id
    elif delta1 < delta2:
        winner_id = p1.user_id
    elif delta2 < delta1:
        winner_id = p2.user_id
    else:
        winner_id = None  # tie

    # ELO gain: 50-100 based on accuracy (average delta across both players)
    avg_delta = (delta1 + delta2) / 2 if (delta1 + delta2) > 0 else 0
    base_elo = max(50, min(100, 100 - int(avg_delta)))
    if winner_id:
        winner_player = p1 if p1.user_id == winner_id else p2
        loser_player = p2 if p1.user_id == winner_id else p1
        winner_profile = db.get(Profile, winner_id)
        apply_rewards(db, winner_profile, coins=200, elo=base_elo, reason=f"Duel win: {duel.id}")
        winner_player.elo_delta = base_elo
        winner_player.elo_after = winner_profile.elo
        winner_player.coins_won = 200
        winner_player.finished_at = datetime.now(timezone.utc)

        loser_player.elo_delta = 0
        loser_player.coins_won = 0
        loser_player.finished_at = datetime.now(timezone.utc)

        duel.winner_id = winner_id
    else:
        p1.elo_delta = 0
        p2.elo_delta = 0
        p1.finished_at = datetime.now(timezone.utc)
        p2.finished_at = datetime.now(timezone.utc)

    duel.finished_at = datetime.now(timezone.utc)
    db.commit()


def _serialize_common_routine(db: Session, routine: CommonRoutine, viewer_id: str) -> dict:
    creator = db.get(Profile, routine.creator_id)
    friend = db.get(Profile, routine.friend_id)
    return {
        "id": routine.id,
        "creator_id": routine.creator_id,
        "friend_id": routine.friend_id,
        "name": routine.name,
        "emoji": routine.emoji,
        "created_at": routine.created_at,
        "tasks": [
            {
                "id": t.id,
                "title": t.title,
                "note": t.note,
                "scheduled_time": t.scheduled_time,
                "position": t.position,
            }
            for t in sorted(routine.tasks, key=lambda x: x.position)
        ],
        "creator_username": creator.username if creator else None,
        "friend_username": friend.username if friend else None,
    }


def _serialize_duel(db: Session, duel: Duel, viewer_id: str) -> dict:
    tasks = []
    for task in sorted(duel.tasks, key=lambda x: x.position):
        me_done = any(c.user_id == viewer_id for c in task.completions)
        opp_done = any(c.user_id != viewer_id for c in task.completions)
        tasks.append(
            {
                "id": task.id,
                "title": task.title,
                "scheduled_time": task.scheduled_time,
                "position": task.position,
                "completed_by_me": me_done,
                "completed_by_opponent": opp_done,
            }
        )

    players = []
    for player in duel.players:
        profile = db.get(Profile, player.user_id)
        players.append(
            {
                "user_id": player.user_id,
                "username": profile.username if profile else None,
                "avatar_slug": profile.avatar_slug if profile else None,
"avatar_url": public_url(profile.avatar_path) if profile and profile.avatar_path else None,
                "elo_before": player.elo_before,
                "elo_after": player.elo_after,
                "elo_delta": player.elo_delta,
                "coins_won": player.coins_won,
                "joined_at": player.joined_at,
                "finished_at": player.finished_at,
                "is_you": player.user_id == viewer_id,
            }
        )

    return {
        "id": duel.id,
        "common_routine_id": duel.common_routine_id,
        "common_routine_name": duel.common_routine.name if duel.common_routine else "",
        "challenger_id": duel.challenger_id,
        "opponent_id": duel.opponent_id,
        "status": duel.status,
        "winner_id": duel.winner_id,
        "created_at": duel.created_at,
        "started_at": duel.started_at,
        "finished_at": duel.finished_at,
        "tasks": tasks,
        "players": players,
        "you_won": duel.winner_id == viewer_id,
    }
