"""ORM models for Routinery.

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


class Routine(Base):
    __tablename__ = "routines"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("profiles.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    emoji: Mapped[str] = mapped_column(String(8), default="✅", nullable=False)
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
