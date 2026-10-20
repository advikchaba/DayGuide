"""SQLAlchemy engine / session plumbing.

The same models run on SQLite (zero-config local development) and on the
Supabase Postgres instance in production - only ``DATABASE_URL`` changes.
"""

from __future__ import annotations

from collections.abc import Iterator

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, Query, sessionmaker

from .config import settings


class Base(DeclarativeBase):
    """Declarative base for every ORM model."""


_connect_args = {"check_same_thread": False} if settings.is_sqlite else {}

engine = create_engine(
    settings.database_url,
    connect_args=_connect_args,
    pool_pre_ping=True,
    future=True,
)

SessionLocal = sessionmaker(
    bind=engine,
    autocommit=False,
    autoflush=False,
    expire_on_commit=False,
)


def get_db() -> Iterator[Session]:
    """FastAPI dependency that yields a request-scoped session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def create_all() -> None:
    """Create tables that do not exist yet (safe on both SQLite and Postgres)."""
    from . import models  # noqa: F401  (registers the mappers)

    Base.metadata.create_all(bind=engine)


def select_for_update(query: Query, db: Session) -> Query:
    """Add a row lock when the dialect supports it.

    SQLite has no ``SELECT ... FOR UPDATE``; it serialises writers at the file
    level instead, so skipping the lock there is safe for local development.
    """
    if settings.is_sqlite:
        return query
    return query.with_for_update()
