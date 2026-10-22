"""Routinery API entry point.

Run locally:
    cd backend
    uvicorn app.main:app --reload --port 8000
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from starlette.concurrency import run_in_threadpool

from .config import settings
from .database import SessionLocal, create_all
from .routers import auth_dev, leaderboard, profile, routines, shop
from .seed import run_seed
from .services import db_sync
from .services.storage import uploads_root

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)-7s %(name)s: %(message)s")
logger = logging.getLogger("routinery")


@asynccontextmanager
async def lifespan(_app: FastAPI):
    create_all()
    with SessionLocal() as db:
        run_seed(db)
    # Persist the freshly created/migrated/seed database before serving.
    db_sync.upload(force=True)
    if settings.is_serverless and settings.is_sqlite and not db_sync.enabled():
        logger.warning(
            "Serverless SQLite has no durable persistence. Set DATABASE_URL "
            "or the Supabase Storage credentials."
        )
    logger.info(
        "Routinery API ready | env=%s | db=%s | persist=%s | supabase=%s | storage=%s",
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


@app.middleware("http")
async def persist_sqlite_database(request: Request, call_next):
    """Mirror the serverless SQLite file after any request that changed it.

    Reads are cheap: ``upload`` compares the file's mtime and returns without a
    network call when nothing wrote to the database. That matters because
    ``GET /api/me`` can provision a profile on first login.
    """
    response = await call_next(request)
    if db_sync.enabled():
        try:
            await run_in_threadpool(db_sync.upload)
        except Exception:
            logger.exception("Could not persist the SQLite database to Supabase Storage")
    return response


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
