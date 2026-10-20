"""SQLAlchemy engine / session plumbing.

The same models run on SQLite (zero-config local development) and on the
Supabase Postgres instance in production - only ``DATABASE_URL`` changes.
"""

from __future__ import annotations

from collections.abc import Iterator
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, Query, sessionmaker
from sqlalchemy.pool import NullPool

from .config import settings


class Base(DeclarativeBase):
    """Declarative base for every ORM model."""


def _sqlalchemy_url(url: str) -> str:
    """Accept the connection strings Supabase hands out verbatim.

    Supabase shows ``postgresql://...`` (and sometimes Prisma's
    ``?pgbouncer=true`` flags). SQLAlchemy needs the psycopg driver in the
    scheme, and psycopg rejects Prisma-only query parameters.
    """
    if url.startswith("postgres://"):
        url = "postgresql+psycopg://" + url[len("postgres://") :]
    elif url.startswith("postgresql://"):
        url = "postgresql+psycopg://" + url[len("postgresql://") :]

    if url.startswith("postgresql+psycopg://"):
        parts = urlsplit(url)
        query = [
            (key, value)
            for key, value in parse_qsl(parts.query, keep_blank_values=True)
            if key not in {"pgbouncer", "connection_limit"}
        ]
        url = urlunsplit((parts.scheme, parts.netloc, parts.path, urlencode(query), parts.fragment))
    return url


DATABASE_URL = _sqlalchemy_url(settings.database_url)

_engine_kwargs: dict[str, object] = {
    "future": True,
    "connect_args": {"check_same_thread": False} if settings.is_sqlite else {"prepare_threshold": None},
}

if settings.is_serverless:
    # Vercel functions are short-lived; a module-level pool would leak
    # connections and exhaust Supabase's pooler under traffic.
    _engine_kwargs["poolclass"] = NullPool
else:
    _engine_kwargs["pool_pre_ping"] = True

engine = create_engine(DATABASE_URL, **_engine_kwargs)

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
