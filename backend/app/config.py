"""Application configuration (environment variables + optional .env file)."""

from __future__ import annotations

import os
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    app_name: str = "Routinery API"
    environment: str = "development"
    api_prefix: str = "/api"
    frontend_origin: str = "http://localhost:5173"
    extra_origins: str = ""

    # --- Database ---------------------------------------------------------
    database_url: str = "sqlite:///./routinery.db"

    # --- Supabase ---------------------------------------------------------
    supabase_url: str = ""
    supabase_anon_key: str = ""
    # New Supabase dashboard naming. The legacy names above still work.
    supabase_publishable_key: str = ""
    supabase_service_role_key: str = ""
    supabase_secret_key: str = ""
    supabase_jwt_secret: str = ""
    supabase_jwt_audience: str = "authenticated"
    supabase_storage_bucket: str = "proofs"

    # --- Local dev auth ---------------------------------------------------
    dev_auth: bool = True
    dev_jwt_secret: str = "routinery-dev-secret-change-me"

    # --- Photo verification -----------------------------------------------
    vision_provider: str = "mock"  # mock | openai | off
    vision_api_key: str = ""
    vision_base_url: str = "https://api.openai.com/v1"
    vision_model: str = "gpt-4o-mini"
    auto_approve_proofs: bool = True
    upload_dir: str = "uploads"
    max_upload_bytes: int = 8 * 1024 * 1024
    # Optional absolute API origin used for fallback local uploads (Vercel).
    public_base_url: str = ""

    admin_emails: str = ""

    # Seed a believable leaderboard on first run (never in production).
    seed_demo_players: bool = True

    # ------------------------------------------------------------------ #
    # Derived helpers
    # ------------------------------------------------------------------ #
    @property
    def cors_origins(self) -> list[str]:
        origins = {o.strip().rstrip("/") for o in self.extra_origins.split(",") if o.strip()}
        if self.frontend_origin.strip():
            origins.add(self.frontend_origin.strip().rstrip("/"))
        return sorted(origins)

    @property
    def admin_email_set(self) -> set[str]:
        return {e.strip().lower() for e in self.admin_emails.split(",") if e.strip()}

    @property
    def supabase_public_key(self) -> str:
        """The browser-safe Supabase key (legacy anon or new publishable)."""
        return (self.supabase_anon_key or self.supabase_publishable_key).strip()

    @property
    def supabase_service_key(self) -> str:
        """The server-only Supabase key used for Storage uploads."""
        return (self.supabase_service_role_key or self.supabase_secret_key).strip()

    @property
    def supabase_configured(self) -> bool:
        return bool(self.supabase_url.strip() and self.supabase_public_key)

    @property
    def supabase_storage_configured(self) -> bool:
        return bool(self.supabase_url.strip() and self.supabase_service_key and self.supabase_storage_bucket.strip())

    @property
    def dev_auth_enabled(self) -> bool:
        """The offline provider is only valid while Supabase is not configured.

        Once real Supabase credentials exist, dev tokens/accounts are refused so
        every profile is backed by a verified Supabase email or Google identity.
        """
        return self.dev_auth and not self.supabase_configured

    @property
    def is_sqlite(self) -> bool:
        return self.database_url.startswith("sqlite")

    @property
    def is_production(self) -> bool:
        return self.environment.lower() in {"production", "prod"}

    @property
    def is_serverless(self) -> bool:
        """True inside a Vercel/edge function where connections must not pool."""
        return bool(os.getenv("VERCEL"))


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
