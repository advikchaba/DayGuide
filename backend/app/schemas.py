"""Pydantic request/response models."""

from __future__ import annotations

from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

USERNAME_PATTERN = r"^[A-Za-z0-9_.]{3,20}$"


# --------------------------------------------------------------------------- #
# Auth (dev provider)
# --------------------------------------------------------------------------- #
class DevSignupRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    username: str | None = Field(default=None, min_length=3, max_length=20)


class DevLoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    profile: "ProfileOut"


# --------------------------------------------------------------------------- #
# Profile
# --------------------------------------------------------------------------- #
class ProfileOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    email: str
    username: str | None
    username_changes: int
    username_change_cost: int
    coins: int
    elo: int
    rank: dict
    avatar_slug: str
    avatar_url: str | None = None
    avatar_change_cost: int
    theme_slug: str
    streak: int
    best_streak: int
    routines_completed: int
    tasks_completed: int
    matches_won: int
    matches_played: int
    last_perfect_on: str | None
    created_at: str


class UsernameRequest(BaseModel):
    username: str = Field(min_length=3, max_length=20)

    @field_validator("username")
    @classmethod
    def validate_username(cls, value: str) -> str:
        import re

        value = value.strip()
        if not re.match(USERNAME_PATTERN, value):
            raise ValueError("Usernames can only use letters, numbers, dot and underscore (3-20 chars).")
        return value


class CosmeticRequest(BaseModel):
    slug: str = Field(min_length=1, max_length=48)


class DevGrantRequest(BaseModel):
    """Test-only helper: top up coins/ELO without grinding the checklist."""

    coins: int = Field(default=0, ge=0, le=500_000)
    elo: int = Field(default=0, ge=0, le=2_400)


# --------------------------------------------------------------------------- #
# Routines
# --------------------------------------------------------------------------- #
class TaskIn(BaseModel):
    title: str = Field(min_length=1, max_length=120)
    note: str | None = Field(default=None, max_length=400)
    requires_proof: bool = False
    scheduled_time: str = Field(default="09:00", pattern=r"^([01]\d|2[0-3]):[0-5]\d$")
    coin_value: int = Field(default=10, ge=0, le=200)


class TaskOut(BaseModel):
    id: int
    title: str
    note: str | None
    requires_proof: bool
    scheduled_time: str
    coin_value: int
    position: int
    completed_today: bool = False
    proof_status: str | None = None


class RoutineIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    emoji: str = Field(default="", max_length=8)
    tasks: list[TaskIn] = Field(default_factory=list, max_length=40)


class RoutineUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=80)
    emoji: str | None = Field(default=None, max_length=8)


class RoutineOut(BaseModel):
    id: int
    name: str
    emoji: str
    created_at: str
    tasks: list[TaskOut]
    total: int
    done: int
    percent: float
    perfect_today: bool


class RewardOut(BaseModel):
    coins: int
    elo: int
    base_coins: int
    perfect_coins: int
    perfect_elo: int
    perfect: bool
    streak: int
    rank_name: str
    rank_progress: float
    messages: list[str]
    new_balance: int = 0
    new_elo: int = 0
    on_time: bool = True
    time_delta_minutes: int = 0
    scheduled_time: str | None = None


class CompletionIn(BaseModel):
    """The user's local clock, supplied by the browser.

    Scheduled times are wall-clock times in the user's timezone, so the server
    cannot compare them against UTC without this hint.
    """

    local_time: str | None = Field(default=None, pattern=r"^([01]\d|2[0-3]):[0-5]\d$")
    local_date: date | None = None


class TaskCompleteOut(BaseModel):
    task_id: int
    completed: bool
    routine: RoutineOut
    reward: RewardOut


# --------------------------------------------------------------------------- #
# Shop
# --------------------------------------------------------------------------- #
class ShopItemOut(BaseModel):
    slug: str
    name: str
    kind: str
    description: str
    price: int
    rarity: str
    is_free: bool
    meta: dict
    owned: bool = False
    equipped: bool = False


class ShopOut(BaseModel):
    items: list[ShopItemOut]
    coins: int


# --------------------------------------------------------------------------- #
# Proofs / verification
# --------------------------------------------------------------------------- #
class ProofOut(BaseModel):
    id: int
    status: str
    confidence: float
    reason: str
    reviewer: str
    claimed: str
    image_url: str
    coins_awarded: int
    created_at: str
    user_id: str | None = None
    username: str | None = None


class ProofVerificationOut(BaseModel):
    proof: ProofOut
    approved: bool
    coins_awarded: int = 0
    elo_awarded: int = 0
    task_id: int | None = None
    match_id: int | None = None
    reward: RewardOut | None = None
    routine: RoutineOut | None = None
    match: "MatchOut | None" = None


class ReviewRequest(BaseModel):
    approve: bool
    reason: str | None = Field(default=None, max_length=300)


# --------------------------------------------------------------------------- #
# Ranked
# --------------------------------------------------------------------------- #
class QueueRequest(BaseModel):
    routine_id: int | None = None


class MatchPlayerOut(BaseModel):
    user_id: str
    username: str | None
    avatar_slug: str
    avatar_url: str | None = None
    rank_name: str
    elo: int
    progress: int
    total: int
    finished: bool
    is_you: bool
    elo_delta: int = 0
    coins_won: int = 0


class MatchTaskOut(BaseModel):
    id: int
    title: str
    position: int
    approved: bool = False
    proof_status: str | None = None


class MatchOut(BaseModel):
    id: int
    code: str
    status: str
    routine_name: str
    created_at: str
    started_at: str | None
    finished_at: str | None
    winner_id: str | None
    tasks: list[MatchTaskOut]
    players: list[MatchPlayerOut]
    you_finished: bool = False
    you_won: bool = False


class MatchJoinRequest(BaseModel):
    code: str = Field(min_length=4, max_length=8)


# --------------------------------------------------------------------------- #
# Leaderboard
# --------------------------------------------------------------------------- #
class LeaderboardEntry(BaseModel):
    position: int
    user_id: str
    username: str | None
    avatar_slug: str
    avatar_url: str | None = None
    elo: int
    rank_name: str
    rank_color: str
    coins: int
    matches_won: int
    streak: int
    is_you: bool = False


class LeaderboardOut(BaseModel):
    entries: list[LeaderboardEntry]
    you: LeaderboardEntry | None = None
    total_players: int


class LedgerOut(BaseModel):
    id: int
    delta: int
    elo_delta: int
    reason: str
    created_at: datetime


TokenResponse.model_rebuild()
ProofVerificationOut.model_rebuild()
