"""Idempotent database seeding: shop catalogue + optional demo ladder."""

from __future__ import annotations

import logging

from sqlalchemy.orm import Session

from .catalog import build_catalog
from .config import settings
from .economy import rank_for, today
from .models import Profile, ShopItem
from .security import new_user_id

logger = logging.getLogger("routinery.seed")

_DEMO_PLAYERS = (
    ("NightOwl", 2320, 18450, 41, 22),
    ("RoutineRocket", 2115, 15230, 33, 17),
    ("MercuryMaya", 1875, 12870, 28, 14),
    ("ZenithZane", 1640, 9910, 24, 11),
    ("GlowGetter", 1425, 7620, 19, 9),
    ("EarlyBirdie", 1210, 5180, 15, 7),
    ("SunriseSam", 980, 3410, 11, 5),
    ("TinySteps", 760, 2140, 8, 4),
    ("WarmUpWes", 540, 1180, 5, 2),
    ("DayOneDina", 320, 640, 2, 1),
)


def sync_catalog(db: Session) -> None:
    """Upsert every catalogue entry so price/description changes ship safely."""
    for item in build_catalog():
        existing = db.get(ShopItem, item["slug"])
        if existing:
            existing.name = item["name"]
            existing.kind = item["kind"]
            existing.description = item["description"]
            existing.price = item["price"]
            existing.rarity = item["rarity"]
            existing.is_free = item["is_free"]
            existing.sort_order = item["sort_order"]
            existing.meta = item["meta"]
        else:
            db.add(ShopItem(**item))
    db.commit()


def seed_demo_ladder(db: Session) -> None:
    """Populate a believable ladder so the leaderboard is not empty on day one."""
    if not settings.seed_demo_players or settings.is_production:
        return

    existing = db.query(Profile.id).filter(Profile.email.like("%@demo.routinery")).count()
    if existing:
        return

    for index, (username, elo, coins, wins, streak) in enumerate(_DEMO_PLAYERS):
        rank = rank_for(elo)
        db.add(
            Profile(
                id=new_user_id(),
                email=f"{username.lower()}@demo.routinery",
                username=username,
                coins=coins,
                elo=elo,
                streak=streak,
                best_streak=streak,
                matches_won=wins,
                matches_played=max(wins, wins + 6),
                routines_completed=wins * 2,
                tasks_completed=wins * 9,
                avatar_slug=["spark", "flame", "moon", "cat", "bolt", "leaf", "crown", "robot", "rocket", "sun"][index % 10],
                theme_slug=["dark", "blue", "pink", "green", "purple", "red", "yellow", "light", "blue", "dark"][index % 10],
                last_perfect_on=today(),
            )
        )
        logger.debug("Seeded demo player %s (%s)", username, rank.name)
    db.commit()


def run_seed(db: Session) -> None:
    sync_catalog(db)
    seed_demo_ladder(db)
