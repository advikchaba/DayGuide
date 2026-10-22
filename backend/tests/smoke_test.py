"""End-to-end smoke test for the timing-based Routinery API.

Runs the real FastAPI app against a throwaway SQLite database:
signup -> timed routine -> on-time/late rewards -> perfect day -> shop -> ladder.

Usage:
    python tests/smoke_test.py
"""

from __future__ import annotations

import base64
import os
import sys
import tempfile
import uuid
from datetime import date, datetime, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

DB_PATH = ROOT / "test_routinery.db"
if DB_PATH.exists():
    DB_PATH.unlink()

os.environ.update(
    DATABASE_URL=f"sqlite:///{DB_PATH.as_posix()}",
    ENVIRONMENT="test",
    DEV_AUTH="true",
    SEED_DEMO_PLAYERS="true",
    # Force the offline provider even when a developer has real Supabase
    # credentials in backend/.env.
    SUPABASE_URL="",
    SUPABASE_ANON_KEY="",
    SUPABASE_PUBLISHABLE_KEY="",
    SUPABASE_SERVICE_ROLE_KEY="",
    SUPABASE_SECRET_KEY="",
    SUPABASE_STORAGE_BUCKET="",
    UPLOAD_DIR=str(Path(tempfile.gettempdir()) / f"routinery-test-uploads-{uuid.uuid4().hex[:8]}"),
)

from fastapi.testclient import TestClient  # noqa: E402

from app.config import settings  # noqa: E402

# Environment variables cannot override an already-loaded .env with blank
# values on every platform, so clear the Supabase keys directly too.
settings.supabase_url = ""
settings.supabase_anon_key = ""
settings.supabase_publishable_key = ""
settings.upload_dir = os.environ["UPLOAD_DIR"]

from app.main import app  # noqa: E402

PASSED: list[str] = []
TODAY = date.today().isoformat()
AVATAR_PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
)


def check(label: str, condition: bool, detail: object = "") -> None:
    if not condition:
        raise AssertionError(f"FAILED: {label} -> {detail}")
    PASSED.append(label)
    print(f"  ok  {label}")


def signup(client: TestClient, email: str, username: str | None = None) -> dict:
    response = client.post(
        "/api/auth/dev/signup",
        json={"email": email, "password": "sup3rsecret!", "username": username},
    )
    assert response.status_code == 201, response.text
    return response.json()


def auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def minutes_ago(minutes: int) -> str:
    return (datetime.now() - timedelta(minutes=minutes)).strftime("%H:%M")


def main() -> None:
    with TestClient(app) as client:
        print("\n== bootstrap ==")
        health = client.get("/api/health").json()
        check("health endpoint", health["status"] == "ok", health)

        config = client.get("/api/config").json()
        check("rank ladder exposed", len(config["ranks"]) == 6, config["ranks"])
        check("perfect routine pays 200 coins", config["economics"]["perfect_routine_coins"] == 200)
        check("timing window is 20 minutes", config["economics"]["on_time_window_minutes"] == 20)

        print("\n== auth ==")
        email = f"player-{uuid.uuid4().hex[:8]}@routinery.dev"
        session = signup(client, email)
        token = session["access_token"]
        headers = auth(token)
        check("signup returns token + profile", session["profile"]["coins"] == 100, session["profile"])
        check("signup starts at Copper", session["profile"]["rank"]["name"] == "Copper", session["profile"]["rank"])
        check("new accounts have no routine", client.get("/api/routines", headers=headers).json() == [])

        me = client.get("/api/me", headers=headers).json()
        check("me endpoint works", me["email"] == email, me)

        check(
            "duplicate email rejected",
            client.post("/api/auth/dev/signup", json={"email": email, "password": "anotherpass1"}).status_code == 409,
        )
        check(
            "bad password rejected",
            client.post("/api/auth/dev/login", json={"email": email, "password": "nope"}).status_code == 401,
        )
        check("login works", client.post("/api/auth/dev/login", json={"email": email, "password": "sup3rsecret!"}).status_code == 200)

        print("\n== username ==")
        availability = client.get("/api/usernames/available", params={"username": "TimingTina"}).json()
        check("username availability check", availability["available"] is True, availability)
        updated = client.post("/api/me/username", json={"username": "TimingTina"}, headers=headers).json()
        check("first username is free", updated["username"] == "TimingTina" and updated["coins"] == 100, updated)
        blocked = client.post("/api/me/username", json={"username": "SomeoneElse"}, headers=headers)
        check("username change costs 400 coins", blocked.status_code == 400, blocked.text)

        uploaded = client.post(
            "/api/me/avatar/upload",
            headers=headers,
            files={"file": ("pfp.png", AVATAR_PNG, "image/png")},
        )
        uploaded_payload = uploaded.json() if uploaded.status_code == 200 else {}
        check(
            "new account can upload a profile picture",
            uploaded.status_code == 200
            and uploaded_payload.get("coins") == 0
            and bool(uploaded_payload.get("avatar_url")),
            uploaded.text,
        )
        blocked_upload = client.post(
            "/api/me/avatar/upload",
            headers=headers,
            files={"file": ("pfp.png", AVATAR_PNG, "image/png")},
        )
        check("profile picture change costs 100 coins", blocked_upload.status_code == 400, blocked_upload.text)

        print("\n== timed routine ==")
        created = client.post(
            "/api/routines",
            headers=headers,
            json={
                "name": "Timed Start",
                "tasks": [
                    {"title": "Morning walk", "scheduled_time": "09:00", "coin_value": 10},
                    {"title": "Read 10 pages", "scheduled_time": "10:00", "coin_value": 15},
                ],
            },
        )
        check("routine created", created.status_code == 201, created.text)
        routine = created.json()
        first, second = [task["id"] for task in routine["tasks"]]
        check("scheduled times persisted", [t["scheduled_time"] for t in routine["tasks"]] == ["09:00", "10:00"], routine["tasks"])

        # Check the first task in at exactly its scheduled minute (zero diff).
        on_time = client.post(
            f"/api/tasks/{first}/complete",
            headers=headers,
            json={"local_time": "09:00", "local_date": TODAY},
        ).json()["reward"]
        check("on-time task pays coins", on_time["coins"] == 10, on_time)
        check("on-time task pays +50 ELO", on_time["elo"] == 50, on_time)
        check("on-time task is flagged", on_time["on_time"] is True, on_time)

        # The second task is two hours late, so the day cannot be perfect.
        late = client.post(
            f"/api/tasks/{second}/complete",
            headers=headers,
            json={"local_time": "12:00", "local_date": TODAY},
        ).json()["reward"]
        check("late task pays no coins", late["coins"] == 0, late)
        check("late task penalty is capped at -30", late["elo"] == -30, late)
        check("late task blocks the perfect day", late["perfect"] is False, late)
        check("late task is flagged", late["on_time"] is False and late["time_delta_minutes"] == 120, late)

        # Un-tick reverses the exact deltas.
        reverted = client.delete(f"/api/tasks/{second}/complete", params={"local_date": TODAY}, headers=headers).json()["reward"]
        check("late uncheck reverses the penalty", reverted["elo"] == 30, reverted)
        me = client.get("/api/me", headers=headers).json()
        check("ELO back to 150", me["elo"] == 150, me["elo"])

        print("\n== perfect day ==")
        created = client.post(
            "/api/routines",
            headers=headers,
            json={"name": "Perfect Day", "tasks": [{"title": "One task", "scheduled_time": minutes_ago(0)}]},
        ).json()
        task_id = created["tasks"][0]["id"]
        perfect = client.post(
            f"/api/tasks/{task_id}/complete",
            headers=headers,
            json={"local_time": minutes_ago(0), "local_date": TODAY},
        ).json()["reward"]
        check("perfect day awarded", perfect["perfect"] is True, perfect)
        check("perfect day pays 200 bonus coins", perfect["perfect_coins"] == 200, perfect)
        check("perfect day adds no bonus ELO", perfect["perfect_elo"] == 0, perfect)
        check("perfect-day streak starts", perfect["streak"] == 1, perfect)

        undone = client.delete(f"/api/tasks/{task_id}/complete", params={"local_date": TODAY}, headers=headers).json()["reward"]
        check("task + perfect-day coins reverted", undone["coins"] == -210, undone)
        check("task + perfect-day ELO reverted", undone["elo"] == -50, undone)

        print("\n== shop ==")
        shop = client.get("/api/shop", headers=headers).json()
        themes = [item for item in shop["items"] if item["kind"] == "theme"]
        check("shop has 13 themes", len(themes) == 13, len(themes))
        check("shop only sells themes", all(item["kind"] == "theme" for item in shop["items"]), shop["items"])
        check("colour themes cost 10k", all(t["price"] == 10_000 for t in themes if t["rarity"] == "rare"), themes)
        check("meme themes cost 20k", all(t["price"] == 20_000 for t in themes if t["rarity"] == "epic"), themes)
        check("dark + light are free", {"dark", "light"} <= {t["slug"] for t in themes if t["is_free"]})

        poor = client.post("/api/shop/blue/buy", headers=headers)
        check("cannot afford 10k theme yet", poor.status_code == 400, poor.text)

        equipped = client.post("/api/me/theme", json={"slug": "light"}, headers=headers).json()
        check("free theme equippable", equipped["theme_slug"] == "light", equipped)
        back = client.post("/api/shop/dark/equip", headers=headers)
        check(
            "free theme can switch back through the shop",
            back.status_code == 200 and back.json()["theme_slug"] == "dark",
            back.text,
        )

        granted = client.post("/api/auth/dev/grant", json={"coins": 40_000}, headers=headers).json()
        check("dev grant tops up the wallet", granted["coins"] >= 40_000, granted["coins"])

        old_avatar_url = uploaded_payload["avatar_url"]
        old_avatar_file = Path(settings.upload_dir) / old_avatar_url.split("/uploads/", 1)[1]
        replacement = client.post(
            "/api/me/avatar/upload",
            headers=headers,
            files={"file": ("pfp-2.png", AVATAR_PNG, "image/png")},
        )
        replacement_payload = replacement.json() if replacement.status_code == 200 else {}
        check(
            "profile picture can be replaced",
            replacement.status_code == 200
            and replacement_payload.get("avatar_url") != old_avatar_url,
            replacement.text,
        )
        check(
            "picture replacement charged 100 coins",
            replacement_payload.get("coins") == granted["coins"] - 100,
            replacement_payload.get("coins"),
        )
        check("old picture file deleted", not old_avatar_file.exists(), old_avatar_file)

        coins_before = replacement_payload["coins"]
        client.post("/api/shop/blue/buy", headers=headers)
        me = client.get("/api/me", headers=headers).json()
        check("10k theme unlocked", me["theme_slug"] == "blue", me["theme_slug"])
        check("theme charged 10,000 coins", me["coins"] == coins_before - 10_000, me["coins"])

        client.post("/api/shop/meme-doge/buy", headers=headers)
        me = client.get("/api/me", headers=headers).json()
        check("20k meme theme unlocked", me["theme_slug"] == "meme-doge", me["theme_slug"])
        again = client.post("/api/shop/meme-doge/buy", headers=headers)
        check("cannot buy the same item twice", again.status_code == 400, again.text)

        print("\n== leaderboard ==")
        board = client.get("/api/leaderboard", headers=headers).json()
        check("ladder populated", len(board["entries"]) >= 10, len(board["entries"]))
        check("elite player is Ruby", board["entries"][0]["rank_name"] == "Ruby", board["entries"][0])
        check("my row is included", board["you"] is not None and board["you"]["username"] == "TimingTina", board["you"])
        check(
            "uploaded picture appears on ladder",
            board["you"] is not None and bool(board["you"].get("avatar_url")),
            board["you"],
        )
        check("sorted by ELO", board["entries"][0]["elo"] >= board["entries"][-1]["elo"])
        check(
            "race metric no longer advertised",
            client.get("/api/leaderboard", params={"metric": "matches_won"}, headers=headers).status_code == 200,
        )

        print(f"\nAll {len(PASSED)} checks passed.")


if __name__ == "__main__":
    try:
        main()
    finally:
        if DB_PATH.exists():
            try:
                DB_PATH.unlink()
            except PermissionError:
                pass
