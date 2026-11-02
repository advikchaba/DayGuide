"""ORM models for DayGuide.

Tables
------
profiles            one row per authenticated user (coins, ELO, cosmetics)
routines / tasks    the daily checklist a user builds
task_completions    one row per task per day (drives streaks + rewards)
perfect_days        granted once per routine per day when everything is ticked
shop_items          catalogue of themes + avatars
purchases           which cosmetics a user owns
ledger_entries      audit trail of every coin movement
proofs              uploaded photos waiting for / receiving verification
matches / match_*   head-to-head ranked races
"""

from __future__ import annotations

from datetime import date, datetime, timezone

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    JSON,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Profile(Base):
    __tablename__ = "profiles"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    username: Mapped[str | None] = mapped_column(String(24), unique=True, index=True, nullable=True)
    username_changes: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    # Only populated by the local dev auth provider; Supabase owns passwords in production.
    password_hash: Mapped[str | None] = mapped_column(String(255), nullable=True)

    coins: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    elo: Mapped[int] = mapped_column(Integer, default=100, nullable=False)

    avatar_slug: Mapped[str] = mapped_column(String(48), default="spark", nullable=False)
    avatar_path: Mapped[str | None] = mapped_column(String(300), nullable=True)
    theme_slug: Mapped[str] = mapped_column(String(48), default="dark", nullable=False)

    streak: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    best_streak: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    routines_completed: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    tasks_completed: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    matches_won: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    matches_played: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    last_perfect_on: Mapped[date | None] = mapped_column(Date, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)

    routines: Mapped[list["Routine"]] = relationship(back_populates="owner", cascade="all, delete-orphan")
    purchases: Mapped[list["Purchase"]] = relationship(back_populates="owner", cascade="all, delete-orphan")
    friends: Mapped[list["Friend"]] = relationship(
        foreign_keys="[Friend.user_id]",
        back_populates="user",
        cascade="all, delete-orphan",
    )
    friends_of_me: Mapped[list["Friend"]] = relationship(
        foreign_keys="[Friend.friend_id]",
        back_populates="friend",
        cascade="all, delete-orphan",
    )
    common_routines_created: Mapped[list["CommonRoutine"]] = relationship(
        foreign_keys="[CommonRoutine.creator_id]",
        back_populates="creator",
        cascade="all, delete-orphan",
    )
    common_routines_joined: Mapped[list["CommonRoutine"]] = relationship(
        foreign_keys="[CommonRoutine.friend_id]",
        back_populates="friend",
        cascade="all, delete-orphan",
    )


class Routine(Base):
    __tablename__ = "routines"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("profiles.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    emoji: Mapped[str] = mapped_column(String(8), default="", nullable=False)
    is_ranked_ready: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)

    owner: Mapped[Profile] = relationship(back_populates="routines")
    tasks: Mapped[list["Task"]] = relationship(
        back_populates="routine",
        cascade="all, delete-orphan",
        order_by="Task.position",
    )


class Task(Base):
    __tablename__ = "tasks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    routine_id: Mapped[int] = mapped_column(ForeignKey("routines.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(120), nullable=False)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    requires_proof: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    coin_value: Mapped[int] = mapped_column(Integer, default=10, nullable=False)
    # Local wall-clock time the user planned to do this task ("HH:MM").
    scheduled_time: Mapped[str] = mapped_column(String(5), default="09:00", nullable=False)
    position: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    routine: Mapped[Routine] = relationship(back_populates="tasks")


class TaskCompletion(Base):
    __tablename__ = "task_completions"
    __table_args__ = (UniqueConstraint("task_id", "user_id", "done_on", name="uq_task_user_day"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    task_id: Mapped[int] = mapped_column(ForeignKey("tasks.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("profiles.id", ondelete="CASCADE"), index=True)
    done_on: Mapped[date] = mapped_column(Date, index=True, nullable=False)
    source: Mapped[str] = mapped_column(String(16), default="manual", nullable=False)  # manual | proof
    coins_awarded: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    elo_awarded: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    on_time: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    time_delta_minutes: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    proof_id: Mapped[int | None] = mapped_column(ForeignKey("proofs.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)


class PerfectDay(Base):
    __tablename__ = "perfect_days"
    __table_args__ = (UniqueConstraint("user_id", "routine_id", "done_on", name="uq_perfect_user_routine_day"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("profiles.id", ondelete="CASCADE"), index=True)
    routine_id: Mapped[int] = mapped_column(ForeignKey("routines.id", ondelete="CASCADE"), index=True)
    done_on: Mapped[date] = mapped_column(Date, nullable=False)
    coins_awarded: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    elo_awarded: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)


class ShopItem(Base):
    __tablename__ = "shop_items"

    slug: Mapped[str] = mapped_column(String(48), primary_key=True)
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    kind: Mapped[str] = mapped_column(String(16), nullable=False)  # theme | avatar
    description: Mapped[str] = mapped_column(String(200), default="", nullable=False)
    price: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    rarity: Mapped[str] = mapped_column(String(16), default="common", nullable=False)
    is_free: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=100, nullable=False)
    meta: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)


class Purchase(Base):
    __tablename__ = "purchases"
    __table_args__ = (UniqueConstraint("user_id", "item_slug", name="uq_purchase_user_item"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("profiles.id", ondelete="CASCADE"), index=True)
    item_slug: Mapped[str] = mapped_column(ForeignKey("shop_items.slug", ondelete="CASCADE"))
    price_paid: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)

    owner: Mapped[Profile] = relationship(back_populates="purchases")


class LedgerEntry(Base):
    __tablename__ = "ledger_entries"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("profiles.id", ondelete="CASCADE"), index=True)
    delta: Mapped[int] = mapped_column(Integer, default=0, nullable=False)  # coins (+/-)
    elo_delta: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    reason: Mapped[str] = mapped_column(String(120), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)


class Proof(Base):
    __tablename__ = "proofs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("profiles.id", ondelete="CASCADE"), index=True)
    task_id: Mapped[int | None] = mapped_column(ForeignKey("tasks.id", ondelete="CASCADE"), nullable=True)
    match_id: Mapped[int | None] = mapped_column(ForeignKey("matches.id", ondelete="CASCADE"), nullable=True)
    match_task_id: Mapped[int | None] = mapped_column(
        ForeignKey("match_tasks.id", ondelete="CASCADE"), nullable=True
    )
    claimed: Mapped[str] = mapped_column(String(200), nullable=False)
    image_path: Mapped[str] = mapped_column(String(300), nullable=False)
    status: Mapped[str] = mapped_column(String(16), default="pending", nullable=False)  # pending|approved|rejected
    confidence: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    reason: Mapped[str] = mapped_column(String(400), default="", nullable=False)
    reviewer: Mapped[str] = mapped_column(String(64), default="auto", nullable=False)
    coins_awarded: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class Match(Base):
    __tablename__ = "matches"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    code: Mapped[str] = mapped_column(String(8), unique=True, index=True)
    creator_id: Mapped[str] = mapped_column(ForeignKey("profiles.id", ondelete="CASCADE"), index=True)
    routine_id: Mapped[int | None] = mapped_column(ForeignKey("routines.id", ondelete="SET NULL"), nullable=True)
    routine_name: Mapped[str] = mapped_column(String(80), default="Ranked checklist", nullable=False)
    status: Mapped[str] = mapped_column(String(16), default="waiting", nullable=False)  # waiting|active|finished
    winner_id: Mapped[str | None] = mapped_column(ForeignKey("profiles.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    tasks: Mapped[list["MatchTask"]] = relationship(
        back_populates="match",
        cascade="all, delete-orphan",
        order_by="MatchTask.position",
    )
    players: Mapped[list["MatchPlayer"]] = relationship(
        back_populates="match",
        cascade="all, delete-orphan",
        order_by="MatchPlayer.joined_at",
    )


class MatchTask(Base):
    __tablename__ = "match_tasks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    match_id: Mapped[int] = mapped_column(ForeignKey("matches.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(120), nullable=False)
    position: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    match: Mapped[Match] = relationship(back_populates="tasks")


class MatchPlayer(Base):
    __tablename__ = "match_players"
    __table_args__ = (UniqueConstraint("match_id", "user_id", name="uq_match_player"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    match_id: Mapped[int] = mapped_column(ForeignKey("matches.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("profiles.id", ondelete="CASCADE"), index=True)
    elo_before: Mapped[int] = mapped_column(Integer, default=100, nullable=False)
    elo_after: Mapped[int | None] = mapped_column(Integer, nullable=True)
    elo_delta: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    coins_won: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    joined_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    match: Mapped[Match] = relationship(back_populates="players")


class Friend(Base):
    """Friendship between two users."""

    __tablename__ = "friends"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("profiles.id", ondelete="CASCADE"), index=True)
    friend_id: Mapped[str] = mapped_column(ForeignKey("profiles.id", ondelete="CASCADE"), index=True)
    status: Mapped[str] = mapped_column(String(16), default="pending", nullable=False)  # pending|accepted|declined|blocked
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)

    user: Mapped[Profile] = relationship(foreign_keys=[user_id], back_populates="friends")
    friend: Mapped[Profile] = relationship(foreign_keys=[friend_id], back_populates="friends")

    __table_args__ = (UniqueConstraint("user_id", "friend_id", name="uq_friend_pair"),)


class CommonRoutine(Base):
    """A routine shared between two friends for duels."""

    __tablename__ = "common_routines"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    creator_id: Mapped[str] = mapped_column(ForeignKey("profiles.id", ondelete="CASCADE"), index=True)
    friend_id: Mapped[str] = mapped_column(ForeignKey("profiles.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    emoji: Mapped[str] = mapped_column(String(8), default="", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)

    creator: Mapped[Profile] = relationship(foreign_keys=[creator_id], back_populates="common_routines_created")
    friend: Mapped[Profile] = relationship(foreign_keys=[friend_id], back_populates="common_routines_joined")
    tasks: Mapped[list["CommonRoutineTask"]] = relationship(
        back_populates="common_routine",
        cascade="all, delete-orphan",
        order_by="CommonRoutineTask.position",
    )
    duels: Mapped[list["Duel"]] = relationship(back_populates="common_routine", cascade="all, delete-orphan")


class CommonRoutineTask(Base):
    """Tasks within a shared/common routine."""

    __tablename__ = "common_routine_tasks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    common_routine_id: Mapped[int] = mapped_column(ForeignKey("common_routines.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(120), nullable=False)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    scheduled_time: Mapped[str] = mapped_column(String(5), default="09:00", nullable=False)
    position: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    common_routine: Mapped[CommonRoutine] = relationship(back_populates="tasks")


class Duel(Base):
    """A head-to-head duel between two friends using a shared routine."""

    __tablename__ = "duels"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    common_routine_id: Mapped[int] = mapped_column(ForeignKey("common_routines.id", ondelete="CASCADE"), index=True)
    challenger_id: Mapped[str] = mapped_column(ForeignKey("profiles.id", ondelete="CASCADE"), index=True)
    opponent_id: Mapped[str] = mapped_column(ForeignKey("profiles.id", ondelete="CASCADE"), index=True)
    status: Mapped[str] = mapped_column(String(16), default="waiting", nullable=False)  # waiting|active|finished
    winner_id: Mapped[str | None] = mapped_column(ForeignKey("profiles.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    common_routine: Mapped[CommonRoutine] = relationship(back_populates="duels")
    tasks: Mapped[list["DuelTask"]] = relationship(
        back_populates="duel",
        cascade="all, delete-orphan",
        order_by="DuelTask.position",
    )
    players: Mapped[list["DuelPlayer"]] = relationship(
        back_populates="duel",
        cascade="all, delete-orphan",
        order_by="DuelPlayer.joined_at",
    )


class DuelTask(Base):
    """Tasks within a duel (copied from common routine)."""

    __tablename__ = "duel_tasks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    duel_id: Mapped[int] = mapped_column(ForeignKey("duels.id", ondelete="CASCADE"), index=True)
    common_routine_task_id: Mapped[int | None] = mapped_column(ForeignKey("common_routine_tasks.id", ondelete="SET NULL"), nullable=True)
    title: Mapped[str] = mapped_column(String(120), nullable=False)
    scheduled_time: Mapped[str] = mapped_column(String(5), default="09:00", nullable=False)
    position: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    duel: Mapped[Duel] = relationship(back_populates="tasks")
    completions: Mapped[list["DuelTaskCompletion"]] = relationship(
        back_populates="duel_task",
        cascade="all, delete-orphan",
    )


class DuelPlayer(Base):
    """A participant in a duel."""

    __tablename__ = "duel_players"

    __table_args__ = (UniqueConstraint("duel_id", "user_id", name="uq_duel_player"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    duel_id: Mapped[int] = mapped_column(ForeignKey("duels.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("profiles.id", ondelete="CASCADE"), index=True)
    elo_before: Mapped[int] = mapped_column(Integer, default=100, nullable=False)
    elo_after: Mapped[int | None] = mapped_column(Integer, nullable=True)
    elo_delta: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    coins_won: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    joined_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    duel: Mapped[Duel] = relationship(back_populates="players")


class DuelTaskCompletion(Base):
    """A task completion within a duel."""

    __tablename__ = "duel_task_completions"

    __table_args__ = (UniqueConstraint("duel_task_id", "user_id", name="uq_duel_task_user"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    duel_task_id: Mapped[int] = mapped_column(ForeignKey("duel_tasks.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("profiles.id", ondelete="CASCADE"), index=True)
    completed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    local_time: Mapped[str | None] = mapped_column(String(5), nullable=True)
    on_time: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    time_delta_minutes: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    elo_delta: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    duel_task: Mapped[DuelTask] = relationship(back_populates="completions")


class LateTaskPass(Base):
    """Record of a user paying 1000 coins to avoid an ELO deduction for a late task."""

    __tablename__ = "late_task_passes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("profiles.id", ondelete="CASCADE"), index=True)
    task_id: Mapped[int] = mapped_column(ForeignKey("tasks.id", ondelete="CASCADE"), index=True)
    paid_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    coins_paid: Mapped[int] = mapped_column(Integer, default=1000, nullable=False)

    __table_args__ = (UniqueConstraint("user_id", "task_id", name="uq_late_task_pass"),)


class DeletedAccount(Base):
    """Tombstone for a deleted profile.

    Supabase access tokens can still verify against the project JWT secret
    until they expire. Without a local tombstone, a deleted user's old token
    would silently provision a brand-new profile and resurrect the account.
    A genuinely new signup gets a new auth id, so the same email is still free
    to register again.
    """

    __tablename__ = "deleted_accounts"

    user_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    email: Mapped[str] = mapped_column(String(255), index=True)
    deleted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
