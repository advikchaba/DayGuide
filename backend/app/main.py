"""Routinery API entry point.

Run locally:
    cd backend
    uvicorn app.main:app --reload --port 8000
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .config import settings
from .database import SessionLocal, create_all
from .routers import auth_dev, leaderboard, profile, ranked, routines, shop
from .seed import run_seed
from .services.storage import uploads_root

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)-7s %(name)s: %(message)s")
logger = logging.getLogger("routinery")


@asynccontextmanager
async def lifespan(_app: FastAPI):
    create_all()
    with SessionLocal() as db:
        run_seed(db)
    logger.info(
        "Routinery API ready | env=%s | db=%s | vision=%s | supabase=%s | storage=%s",
        settings.environment,
        settings.database_url.split("://")[0],
        settings.vision_provider,
        "configured" if settings.supabase_configured else "dev-auth",
        "supabase" if settings.supabase_storage_configured else "local",
    )
    yield


app = FastAPI(
    title=settings.app_name,
    version="1.0.0",
    description="Routine checklists, coins, cosmetics and ELO ranked races with photo verification.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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
    ranked.router,
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
        "vision": settings.vision_provider,
        "storage": "supabase" if settings.supabase_storage_configured else "local",
    }


@app.get("/", include_in_schema=False)
def root() -> dict:
    return {"service": settings.app_name, "docs": "/docs", "health": "/api/health"}
