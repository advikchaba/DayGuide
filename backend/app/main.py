"""DayGuide API entry point.

Run locally:
    cd backend
    uvicorn app.main:app --reload --port 8000
"""

from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from starlette.concurrency import run_in_threadpool

from .config import settings
from .database import SessionLocal, create_all
from .routers import auth_dev, leaderboard, profile, reports, routines, shop
from .seed import run_seed
from .services import db_sync
from .services.storage import uploads_root

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)-7s %(name)s: %(message)s")
logger = logging.getLogger("dayguide")


@asynccontextmanager
async def lifespan(_app: FastAPI):
    create_all()
    with SessionLocal() as db:
        run_seed(db)
    # Persist only if create_all/run_seed actually changed the file. A forced
    # upload here could overwrite a newer snapshot written by another warm
    # instance between our restore and startup.
    db_sync.upload()
    if settings.is_serverless and settings.is_sqlite and not db_sync.enabled():
        logger.warning(
            "Serverless SQLite has no durable persistence. Set DATABASE_URL "
            "or the Supabase Storage credentials."
        )
    logger.info(
        "DayGuide API ready | env=%s | db=%s | persist=%s | supabase=%s | storage=%s",
        settings.environment,
        settings.database_url.split("://")[0],
        "supabase-storage" if db_sync.enabled() else "none",
        "configured" if settings.supabase_configured else "dev-auth",
        "supabase" if settings.supabase_storage_configured else "local",
    )
    yield


app = FastAPI(
    title=settings.app_name,
    version="1.0.0",
    description="Timed routine checklists, coins, cosmetics and an ELO ladder.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


_active_requests = 0
_refreshing = False


@app.middleware("http")
async def persist_sqlite_database(request: Request, call_next):
    """Keep the serverless SQLite file in sync with Supabase Storage.

    Each warm Vercel instance has its own ``/tmp`` copy. Without a check before
    a request, an instance that restored an older snapshot on cold start would
    keep serving (and eventually uploading) stale rows. That made changes like
    a username update appear to vanish depending on which instance answered.

    The refresh only runs for the sole in-flight request and blocks new
    requests while it replaces the file, so a request cannot open a session
    halfway through a restore. Other requests then proceed against the
    refreshed copy. After the response, changes are uploaded as before;
    ``upload`` is a cheap no-op when nothing wrote.
    """
    global _active_requests, _refreshing

    # Wait for a restore that another request started. This uses the event
    # loop rather than an asyncio.Lock so a serverless runtime that creates a
    # fresh loop per invocation cannot leave a lock bound to a dead loop.
    while _refreshing:
        await asyncio.sleep(0.01)

    # No await between the counter change and the refresh decision, so two
    # requests can never both believe they are the only one in flight.
    _active_requests += 1
    try:
        if _active_requests == 1 and db_sync.enabled():
            _refreshing = True
            try:
                await run_in_threadpool(db_sync.refresh_if_stale)
            except Exception:
                logger.exception("Could not refresh the SQLite database from Supabase Storage")
            finally:
                _refreshing = False

        response = await call_next(request)

        if db_sync.enabled():
            try:
                await run_in_threadpool(db_sync.upload)
            except Exception:
                logger.exception("Could not persist the SQLite database to Supabase Storage")
        return response
    finally:
        _active_requests -= 1


# Proof photos are served straight from disk in development. On Vercel the
# filesystem is read-only/ephemeral, so production uses Supabase Storage URLs
# and never mounts this directory.
if not settings.supabase_storage_configured:
    try:
        app.mount("/uploads", StaticFiles(directory=str(uploads_root())), name="uploads")
    except OSError as exc:
        logger.warning("Local upload directory is unavailable; proof photos need Supabase Storage: %s", exc)

for router in (
    auth_dev.router,
    profile.router,
    routines.router,
    shop.router,
    leaderboard.router,
    reports.router,
):
    app.include_router(router, prefix=settings.api_prefix)


@app.get("/api/health", tags=["meta"])
def health() -> dict:
    return {
        "status": "ok",
        "app": settings.app_name,
        "environment": settings.environment,
        "auth": "supabase" if settings.supabase_configured else "dev",
        "storage": "supabase" if settings.supabase_storage_configured else "local",
        "persist": "supabase-storage" if db_sync.enabled() else "none",
    }


@app.get("/", include_in_schema=False)
def root() -> dict:
    return {"service": settings.app_name, "docs": "/docs", "health": "/api/health"}
