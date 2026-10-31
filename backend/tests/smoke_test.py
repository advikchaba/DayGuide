"""End-to-end smoke test for the timing-based DayGuide API.

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
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import jwt

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

DB_PATH = ROOT / "test_routinery.db"
if DB_PATH.exists():
    DB_PATH.unlink()

ADMIN_EMAIL = f"admin-{uuid.uuid4().hex[:8]}@dayguide.dev"

os.environ.update(
    DATABASE_URL=f"sqlite:///{DB_PATH.as_posix()}",
    ENVIRONMENT="test",
    DEV_AUTH="true",
    SEED_DEMO_PLAYERS="true",
    ADMIN_EMAILS=ADMIN_EMAIL,
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
settings.admin_emails = ADMIN_EMAIL
settings.upload_dir = os.environ["UPLOAD_DIR"]

from app.auth import _admin_claim  # noqa: E402
from app.economy import timing_reward  # noqa: E402
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


def main() -> None:
    with TestClient(app) as client:
        print("\n== bootstrap ==")
        health = client.get("/api/health").json()
        check("health endpoint", health["status"] == "ok", health)

        config = client.get("/api/config").json()
        check("rank ladder exposed", len(config["ranks"]) == 6, config["ranks"])
        check("perfect routine pays 200 coins", config["economics"]["perfect_routine_coins"] == 200)
        check("timing window is 20 minutes", config["economics"]["on_time_window_minutes"] == 20)
        check("inside-window ELO is +30 to +50", config["economics"]["on_time_elo_min"] == 30 and config["economics"]["on_time_elo_max"] == 50)
        check("outside-window penalty is doubled", config["economics"]["late_elo_multiplier"] == 2)
        check("exact timing earns +50 ELO", timing_reward("09:00", "09:00")[2] == 50)
        check("10 minutes off earns +40 ELO", timing_reward("09:00", "09:10")[2] == 40)
        check("20 minutes off earns +30 ELO", timing_reward("09:00", "09:20")[2] == 30)
        check("21 minutes off costs -42 ELO", timing_reward("09:00", "09:21")[2] == -42)
        check("30 minutes off costs -60 ELO", timing_reward("09:00", "09:30")[2] == -60)
        check("early and late distance use the same rule", timing_reward("09:00", "08:40")[2] == 30)
        check(
            "server-controlled app_metadata can grant admin",
            _admin_claim({"app_metadata": {"role": "admin"}}),
        )
        check(
            "user metadata cannot grant admin",
            not _admin_claim({"user_metadata": {"role": "admin"}}),
        )

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

        print("\n== task spacing ==")
        dense_first = client.post(
            "/api/routines",
            headers=headers,
            json={
                "name": "Too Dense",
                "tasks": [
                    {"title": "Minute one", "scheduled_time": "12:15"},
                    {"title": "Minute two", "scheduled_time": "12:30"},
                ],
            },
        )
        check("first routine rejects tasks under 30 minutes apart", dense_first.status_code == 400, dense_first.text)

        midnight_first = client.post(
            "/api/routines",
            headers=headers,
            json={
                "name": "Midnight Dense",
                "tasks": [
                    {"title": "Late night", "scheduled_time": "23:50"},
                    {"title": "Early morning", "scheduled_time": "00:10"},
                ],
            },
        )
        check("first-routine spacing wraps across midnight", midnight_first.status_code == 400, midnight_first.text)

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

        too_close_add = client.post(
            f"/api/routines/{routine['id']}/tasks",
            headers=headers,
            json={"title": "Squeezed in", "scheduled_time": "09:15"},
        )
        check("task too close to an existing first-routine task rejected", too_close_add.status_code == 400, too_close_add.text)

        added = client.post(
            f"/api/routines/{routine['id']}/tasks",
            headers=headers,
            json={"title": "Exactly thirty", "scheduled_time": "09:30"},
        )
        check("exactly 30 minutes apart accepted", added.status_code == 201, added.text)
        added_task = next(task for task in added.json()["tasks"] if task["title"] == "Exactly thirty")

        update_conflict = client.patch(
            f"/api/tasks/{added_task['id']}",
            headers=headers,
            json={"title": "Exactly thirty", "scheduled_time": "09:15"},
        )
        check("updating a first-routine task into a conflict rejected", update_conflict.status_code == 400, update_conflict.text)

        update_ok = client.patch(
            f"/api/tasks/{added_task['id']}",
            headers=headers,
            json={"title": "Exactly thirty", "scheduled_time": "11:00"},
        )
        check("moving a task to a free slot accepted", update_ok.status_code == 200, update_ok.text)

        dense_later = client.post(
            "/api/routines",
            headers=headers,
            json={
                "name": "Dense Later",
                "tasks": [
                    {"title": "Minute one", "scheduled_time": "12:15"},
                    {"title": "Minute two", "scheduled_time": "12:30"},
                ],
            },
        )
        check("additional routines can use any times", dense_later.status_code == 201, dense_later.text)
        dense_later_payload = dense_later.json()

        overlap = client.post(
            "/api/routines",
            headers=headers,
            json={"name": "Overlap", "tasks": [{"title": "Clash", "scheduled_time": "09:00"}]},
        )
        check("additional routines can overlap the first", overlap.status_code == 201, overlap.text)
        overlap_payload = overlap.json()
        overlap_task_id = overlap_payload["tasks"][0]["id"]

        later_add = client.post(
            f"/api/routines/{dense_later_payload['id']}/tasks",
            headers=headers,
            json={"title": "Same as first", "scheduled_time": "09:00"},
        )
        check("later routines can add tasks at a first-routine time", later_add.status_code == 201, later_add.text)

        # Tasks unlock in scheduled order. Check the second task before the
        # first one and the API must refuse to award anything.
        out_of_order = client.post(
            f"/api/tasks/{second}/complete",
            headers=headers,
            json={"local_time": "10:00", "local_date": TODAY},
        )
        check("later task is locked behind an earlier open task", out_of_order.status_code == 409, out_of_order.text)

        # Check the first task in at exactly its scheduled minute (zero diff).
        on_time = client.post(
            f"/api/tasks/{first}/complete",
            headers=headers,
            json={"local_time": "09:00", "local_date": TODAY},
        ).json()["reward"]
        check("on-time task pays coins", on_time["coins"] == 10, on_time)
        check("on-time task pays +50 ELO", on_time["elo"] == 50, on_time)
        check("on-time task is flagged", on_time["on_time"] is True, on_time)

        # Starting one routine locks every other routine for the day.
        after_start = client.get("/api/routines", params={"local_date": TODAY}, headers=headers).json()
        started_payload = next(item for item in after_start if item["id"] == routine["id"])
        locked_payload = next(item for item in after_start if item["id"] == overlap_payload["id"])
        check("the started routine stays unlocked", started_payload["locked_today"] is False, started_payload)
        check(
            "other routines lock once a task is checked",
            locked_payload["locked_today"] is True
            and locked_payload["locked_by_routine_id"] == routine["id"]
            and locked_payload["locked_by_routine"] == "Timed Start",
            locked_payload,
        )
        locked_attempt = client.post(
            f"/api/tasks/{overlap_task_id}/complete",
            headers=headers,
            json={"local_time": "09:00", "local_date": TODAY},
        )
        check(
            "a locked routine cannot be checked in",
            locked_attempt.status_code == 409 and "Only one routine" in locked_attempt.json().get("detail", ""),
            locked_attempt.text,
        )

        # The second task is 21 minutes late, so the day cannot be perfect.
        late = client.post(
            f"/api/tasks/{second}/complete",
            headers=headers,
            json={"local_time": "10:21", "local_date": TODAY},
        ).json()["reward"]
        check("late task pays no coins", late["coins"] == 0, late)
        check("outside-window task subtracts two ELO per minute", late["elo"] == -42, late)
        check("late task blocks the perfect day", late["perfect"] is False, late)
        check("late task is flagged", late["on_time"] is False and late["time_delta_minutes"] == 21, late)

        # Un-tick reverses the exact deltas.
        reverted = client.delete(f"/api/tasks/{second}/complete", params={"local_date": TODAY}, headers=headers).json()["reward"]
        check("late uncheck reverses the penalty", reverted["elo"] == 42, reverted)
        me = client.get("/api/me", headers=headers).json()
        check("ELO back to 150", me["elo"] == 150, me["elo"])

        first_reverted = client.delete(
            f"/api/tasks/{first}/complete",
            params={"local_date": TODAY},
            headers=headers,
        ).json()["reward"]
        check("unchecking the active routine reverses its ELO", first_reverted["elo"] == -50, first_reverted)
        me = client.get("/api/me", headers=headers).json()
        check("ELO back to 100 after clearing the routine", me["elo"] == 100, me["elo"])
        after_clear = client.get("/api/routines", params={"local_date": TODAY}, headers=headers).json()
        check(
            "other routines unlock when no routine is active",
            all(item["locked_today"] is False for item in after_clear),
            after_clear,
        )

        print("\n== perfect day ==")
        created = client.post(
            "/api/routines",
            headers=headers,
            json={"name": "Perfect Day", "tasks": [{"title": "One task", "scheduled_time": "12:00"}]},
        ).json()
        task_id = created["tasks"][0]["id"]
        perfect = client.post(
            f"/api/tasks/{task_id}/complete",
            headers=headers,
            json={"local_time": "12:00", "local_date": TODAY},
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
        check("shop has 12 themes", len(themes) == 12, len(themes))
        check("shop only sells themes", all(item["kind"] == "theme" for item in shop["items"]), shop["items"])
        check("clown theme removed", "meme-clown" not in {item["slug"] for item in themes})
        check("colour themes cost 2k", all(t["price"] == 2_000 for t in themes if t["rarity"] == "rare"), themes)
        check("meme themes cost 5k", all(t["price"] == 5_000 for t in themes if t["rarity"] == "epic"), themes)
        check("dark + light are free", {"dark", "light"} <= {t["slug"] for t in themes if t["is_free"]})

        poor = client.post("/api/shop/blue/buy", headers=headers)
        check("cannot afford 2k theme yet", poor.status_code == 400, poor.text)

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
        check("2k theme unlocked", me["theme_slug"] == "blue", me["theme_slug"])
        check("theme charged 2,000 coins", me["coins"] == coins_before - 2_000, me["coins"])

        client.post("/api/shop/meme-doge/buy", headers=headers)
        me = client.get("/api/me", headers=headers).json()
        check("5k meme theme unlocked", me["theme_slug"] == "meme-doge", me["theme_slug"])
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

        print("\n== reports ==")
        report_seed = client.post(
            f"/api/tasks/{first}/complete",
            headers=headers,
            json={"local_time": "09:00", "local_date": TODAY},
        )
        check("report seed check-in accepted", report_seed.status_code == 200, report_seed.text)
        for report_range, expected_days in (("3d", 3), ("week", 7), ("month", 30)):
            response = client.get(
                "/api/reports",
                params={"range": report_range, "local_date": TODAY},
                headers=headers,
            )
            check(f"{report_range} report loads", response.status_code == 200, response.text)
            report = response.json() if response.status_code == 200 else {}
            check(
                f"{report_range} report covers {expected_days} days",
                len(report.get("daily", [])) == expected_days,
                report.get("daily"),
            )
            check(
                f"{report_range} report echoes its range",
                report.get("range") == report_range and report.get("days") == expected_days,
                report,
            )
            summary = report.get("summary", {})
            check(
                f"{report_range} report counts check-ins",
                summary.get("tasks_completed", 0) >= 1
                and summary.get("tasks_on_time", 0) >= 1,
                summary,
            )
            check(
                f"{report_range} report includes previous period",
                "tasks_completed" in report.get("previous", {}),
                report.get("previous"),
            )
            check(
                f"{report_range} report breaks down routines",
                any(row.get("tasks_completed", 0) >= 1 for row in report.get("routines", [])),
                report.get("routines"),
            )
            check(
                f"{report_range} report names a best day",
                bool(report.get("best_day")),
                report.get("best_day"),
            )

        default_report = client.get(
            "/api/reports", params={"local_date": TODAY}, headers=headers
        )
        check(
            "reports default to a weekly window",
            default_report.status_code == 200 and default_report.json()["days"] == 7,
            default_report.text,
        )
        check(
            "unknown report range rejected",
            client.get(
                "/api/reports",
                params={"range": "year", "local_date": TODAY},
                headers=headers,
            ).status_code == 422,
        )
        check(
            "reports require auth",
            client.get("/api/reports", params={"range": "week"}).status_code == 401,
        )
        client.delete(f"/api/tasks/{first}/complete", params={"local_date": TODAY}, headers=headers)
        me = client.get("/api/me", headers=headers).json()
        check("report seed check-in was reversed", me["elo"] == 100, me["elo"])

        print("\n== paid username change ==")
        before = client.get("/api/me", headers=headers).json()
        changed = client.post(
            "/api/me/username", json={"username": "TimingTinaTwo"}, headers=headers
        )
        changed_payload = changed.json() if changed.status_code == 200 else {}
        check(
            "paid username change succeeds",
            changed.status_code == 200 and changed_payload.get("username") == "TimingTinaTwo",
            changed.text,
        )
        check(
            "paid username change charges 400 coins",
            changed_payload.get("coins") == before["coins"] - 400,
            changed_payload,
        )
        check(
            "paid username change increments the change count",
            changed_payload.get("username_changes") == 1,
            changed_payload,
        )
        persisted = client.get("/api/me", headers=headers).json()
        check(
            "paid username change persists on the next read",
            persisted.get("username") == "TimingTinaTwo",
            persisted,
        )
        board = client.get("/api/leaderboard", headers=headers).json()
        check(
            "ladder shows the new username",
            board["you"] is not None and board["you"]["username"] == "TimingTinaTwo",
            board["you"],
        )
        again = client.post(
            "/api/me/username", json={"username": "TimingTinaTwo"}, headers=headers
        )
        again_payload = again.json() if again.status_code == 200 else {}
        check(
            "re-submitting the same username is a no-op",
            again.status_code == 200
            and again_payload.get("coins") == changed_payload.get("coins")
            and again_payload.get("username_changes") == 1,
            again.text,
        )

        print("\n== administration ==")
        admin_session = signup(client, ADMIN_EMAIL)
        admin_headers = auth(admin_session["access_token"])
        check(
            "administrator flag reaches the frontend",
            admin_session["profile"]["is_admin"] is True,
            admin_session["profile"],
        )
        check(
            "ordinary accounts are not administrators",
            client.get("/api/me", headers=headers).json()["is_admin"] is False,
        )
        check(
            "admin routes require authentication",
            client.get("/api/admin/users").status_code == 401,
        )
        check(
            "ordinary accounts are refused admin routes",
            client.get("/api/admin/users", headers=headers).status_code == 403,
        )

        found = client.get(
            "/api/admin/users", params={"q": "TimingTinaTwo"}, headers=admin_headers
        )
        found_payload = found.json() if found.status_code == 200 else {}
        check(
            "admin can search every account by username",
            found.status_code == 200
            and found_payload.get("total") == 1
            and found_payload["items"][0]["username"] == "TimingTinaTwo",
            found.text,
        )
        target_id = found_payload["items"][0]["id"]
        target_email = found_payload["items"][0]["email"]

        detail = client.get(f"/api/admin/users/{target_id}", headers=admin_headers)
        detail_payload = detail.json() if detail.status_code == 200 else {}
        check(
            "admin can open a user with routines, reports and purchases",
            detail.status_code == 200
            and len(detail_payload.get("routines", [])) >= 2
            and len(detail_payload.get("purchases", [])) >= 2
            and len(detail_payload.get("shop", [])) >= 10,
            detail.text,
        )

        report = client.get(
            f"/api/admin/users/{target_id}/reports",
            params={"range": "month", "local_date": TODAY},
            headers=admin_headers,
        )
        check(
            "admin can read a user report",
            report.status_code == 200
            and report.json()["days"] == 30
            and len(report.json()["daily"]) == 30,
            report.text,
        )

        routine_id = detail_payload["routines"][0]["id"]
        renamed = client.patch(
            f"/api/admin/users/{target_id}/routines/{routine_id}",
            json={"name": "Admin Edited Routine"},
            headers=admin_headers,
        )
        check(
            "admin can rename a user routine",
            renamed.status_code == 200
            and renamed.json()["name"] == "Admin Edited Routine",
            renamed.text,
        )

        task_added = client.post(
            f"/api/admin/users/{target_id}/routines/{routine_id}/tasks",
            json={
                "title": "Admin task",
                "scheduled_time": "15:00",
                "coin_value": 15,
                "requires_proof": True,
            },
            headers=admin_headers,
        )
        added_payload = task_added.json() if task_added.status_code == 201 else {}
        added_admin_task = next(
            (task for task in added_payload.get("tasks", []) if task["title"] == "Admin task"),
            None,
        )
        check(
            "admin can add a task to a user routine",
            task_added.status_code == 201
            and added_admin_task is not None
            and added_admin_task["requires_proof"] is True,
            task_added.text,
        )

        task_updated = client.patch(
            f"/api/admin/users/{target_id}/tasks/{added_admin_task['id']}",
            json={
                "title": "Admin task edited",
                "scheduled_time": "16:00",
                "coin_value": 25,
                "requires_proof": True,
            },
            headers=admin_headers,
        )
        updated_task = next(
            (
                task
                for task in (task_updated.json().get("tasks", []) if task_updated.status_code == 200 else [])
                if task["id"] == added_admin_task["id"]
            ),
            None,
        )
        check(
            "admin can edit a user task",
            task_updated.status_code == 200
            and updated_task is not None
            and updated_task["scheduled_time"] == "16:00"
            and updated_task["coin_value"] == 25
            and updated_task["requires_proof"] is True,
            task_updated.text,
        )
        check(
            "first-routine spacing still applies to admin edits",
            client.patch(
                f"/api/admin/users/{target_id}/tasks/{added_admin_task['id']}",
                json={"title": "Too close", "scheduled_time": "10:15", "coin_value": 10},
                headers=admin_headers,
            ).status_code
            == 400,
        )

        deleted_task = client.delete(
            f"/api/admin/users/{target_id}/tasks/{added_admin_task['id']}",
            headers=admin_headers,
        )
        check(
            "admin can delete a user task",
            deleted_task.status_code == 200
            and all(
                task["id"] != added_admin_task["id"]
                for task in deleted_task.json().get("tasks", [])
            ),
            deleted_task.text,
        )

        coins_before = client.get(
            f"/api/admin/users/{target_id}", headers=admin_headers
        ).json()["user"]["coins"]
        coin_grant = client.post(
            f"/api/admin/users/{target_id}/coins/grant",
            json={"amount": 750},
            headers=admin_headers,
        )
        check(
            "coin grants add to the balance",
            coin_grant.status_code == 200
            and coin_grant.json()["applied"]["balance"] == coins_before + 750,
            coin_grant.text,
        )
        coin_zero = client.post(
            f"/api/admin/users/{target_id}/coins/set",
            json={"amount": 0},
            headers=admin_headers,
        )
        check(
            "coin balances can be reduced to zero",
            coin_zero.status_code == 200 and coin_zero.json()["applied"]["balance"] == 0,
            coin_zero.text,
        )
        check(
            "negative coin balances are refused",
            client.post(
                f"/api/admin/users/{target_id}/coins/set",
                json={"amount": -1},
                headers=admin_headers,
            ).status_code
            == 422,
        )
        coin_set = client.post(
            f"/api/admin/users/{target_id}/coins/set",
            json={"amount": 4321},
            headers=admin_headers,
        )
        check(
            "coin balances can be set to any non-negative value",
            coin_set.status_code == 200 and coin_set.json()["applied"]["balance"] == 4321,
            coin_set.text,
        )

        elo_before = client.get(
            f"/api/admin/users/{target_id}", headers=admin_headers
        ).json()["user"]["elo"]
        elo_grant = client.post(
            f"/api/admin/users/{target_id}/elo/grant",
            json={"amount": 5000},
            headers=admin_headers,
        )
        check(
            "ELO grants can cross every rank boundary",
            elo_grant.status_code == 200
            and elo_grant.json()["applied"]["balance"] == elo_before + 5000
            and elo_grant.json()["applied"]["balance"] > 2400,
            elo_grant.text,
        )
        elo_set = client.post(
            f"/api/admin/users/{target_id}/elo/set",
            json={"amount": 800},
            headers=admin_headers,
        )
        check(
            "ELO can be reduced to any value above the floor",
            elo_set.status_code == 200 and elo_set.json()["applied"]["balance"] == 800,
            elo_set.text,
        )
        check(
            "ELO below 100 is refused",
            client.post(
                f"/api/admin/users/{target_id}/elo/set",
                json={"amount": 99},
                headers=admin_headers,
            ).status_code
            == 422,
        )

        shop_before = client.get(
            f"/api/admin/users/{target_id}", headers=admin_headers
        ).json()
        coins_before_item = shop_before["user"]["coins"]
        granted = client.post(
            f"/api/admin/users/{target_id}/items/pink/grant",
            headers=admin_headers,
        )
        after_grant = client.get(
            f"/api/admin/users/{target_id}", headers=admin_headers
        ).json()
        pink_purchase = next(
            (purchase for purchase in after_grant["purchases"] if purchase["slug"] == "pink"),
            None,
        )
        check(
            "admin can grant a shop item for free",
            granted.status_code == 200
            and pink_purchase is not None
            and pink_purchase["price_paid"] == 0
            and after_grant["user"]["coins"] == coins_before_item,
            granted.text,
        )
        check(
            "granted items can be equipped by the user",
            client.post("/api/shop/pink/equip", headers=headers).status_code == 200,
        )
        removed = client.delete(
            f"/api/admin/users/{target_id}/items/pink", headers=admin_headers
        )
        after_remove = client.get(
            f"/api/admin/users/{target_id}", headers=admin_headers
        ).json()
        check(
            "admin can remove a purchased item without changing coins",
            removed.status_code == 200
            and all(purchase["slug"] != "pink" for purchase in after_remove["purchases"])
            and after_remove["user"]["coins"] == coins_before_item,
            removed.text,
        )
        check(
            "removing an equipped theme returns the user to the default",
            after_remove["user"]["theme_slug"] == "dark",
            after_remove["user"]["theme_slug"],
        )
        check(
            "free shop items cannot be granted as paid inventory",
            client.post(
                f"/api/admin/users/{target_id}/items/dark/grant",
                headers=admin_headers,
            ).status_code
            == 400,
        )

        check(
            "deletion needs the exact account email",
            client.request(
                "DELETE",
                f"/api/admin/users/{target_id}",
                json={"confirm_email": "wrong@example.com"},
                headers=admin_headers,
            ).status_code
            == 400,
        )
        deletion = client.request(
            "DELETE",
            f"/api/admin/users/{target_id}",
            json={"confirm_email": target_email},
            headers=admin_headers,
        )
        check(
            "admin can delete an account",
            deletion.status_code == 200
            and deletion.json()["deleted"] is True
            and deletion.json()["email"] == target_email,
            deletion.text,
        )
        check(
            "deleted account tokens stop working immediately",
            client.get("/api/me", headers=headers).status_code == 401,
        )
        check(
            "deleted account no longer appears in admin search",
            client.get(
                "/api/admin/users", params={"q": "TimingTinaTwo"}, headers=admin_headers
            ).json()["total"]
            == 0,
        )

        replacement_session = signup(client, email)
        check(
            "the same email can create a new account after deletion",
            replacement_session["profile"]["id"] != target_id
            and replacement_session["profile"]["coins"] == 100,
            replacement_session["profile"],
        )
        check(
            "the replacement account is a clean profile",
            client.get(
                "/api/me", headers=auth(replacement_session["access_token"])
            ).json()["username"]
            is None,
        )

        print("\n== supabase metadata administration ==")
        # Exercise the production token path without contacting Supabase: a
        # locally signed token with the same audience/claims shape is enough.
        original_supabase = (
            settings.supabase_url,
            settings.supabase_anon_key,
            settings.supabase_jwt_secret,
        )
        settings.supabase_url = "https://example.supabase.co"
        settings.supabase_anon_key = "test-anon-key"
        settings.supabase_jwt_secret = "test-jwt-secret-with-32-bytes-minimum"
        try:
            now = datetime.now(timezone.utc)

            def supabase_token(app_metadata: dict | None = None) -> str:
                payload = {
                    "sub": str(uuid.uuid4()),
                    "email": f"metadata-{uuid.uuid4().hex[:8]}@dayguide.dev",
                    "aud": settings.supabase_jwt_audience,
                    "role": "authenticated",
                    "app_metadata": app_metadata or {},
                    "iat": int(now.timestamp()),
                    "exp": int((now + timedelta(hours=1)).timestamp()),
                }
                return jwt.encode(payload, settings.supabase_jwt_secret, algorithm="HS256")

            metadata_admin_token = supabase_token({"role": "admin"})
            metadata_admin = client.get(
                "/api/me", headers=auth(metadata_admin_token)
            )
            check(
                "Supabase app_metadata role reaches the profile",
                metadata_admin.status_code == 200
                and metadata_admin.json().get("is_admin") is True,
                metadata_admin.text,
            )
            check(
                "Supabase app_metadata admin can use admin routes",
                client.get(
                    "/api/admin/users", headers=auth(metadata_admin_token)
                ).status_code
                == 200,
            )

            plain_token = supabase_token()
            plain = client.get("/api/me", headers=auth(plain_token))
            check(
                "Supabase tokens without the admin role stay ordinary",
                plain.status_code == 200 and plain.json().get("is_admin") is False,
                plain.text,
            )
            check(
                "Supabase tokens without the admin role are refused admin routes",
                client.get(
                    "/api/admin/users", headers=auth(plain_token)
                ).status_code
                == 403,
            )
        finally:
            (
                settings.supabase_url,
                settings.supabase_anon_key,
                settings.supabase_jwt_secret,
            ) = original_supabase

        print("\n== task removal ==")
        removal_headers = auth(replacement_session["access_token"])
        removal_routine = client.post(
            "/api/routines",
            headers=removal_headers,
            json={
                "name": "Removal Test",
                "tasks": [
                    {"title": "Completed task to remove", "scheduled_time": "23:00"},
                    {"title": "Open task to remove", "scheduled_time": "23:30"},
                ],
            },
        )
        check(
            "removal fixture routine created",
            removal_routine.status_code == 201,
            removal_routine.text,
        )
        removal_payload = removal_routine.json()
        completed_task = removal_payload["tasks"][0]
        open_task = removal_payload["tasks"][1]

        checked_in = client.post(
            f"/api/tasks/{completed_task['id']}/complete",
            headers=removal_headers,
            json={"local_time": "23:00", "local_date": TODAY},
        )
        check("removal fixture task checked in", checked_in.status_code == 200, checked_in.text)

        removed_completed = client.delete(
            f"/api/tasks/{completed_task['id']}", headers=removal_headers
        )
        check(
            "a completed task can be removed",
            removed_completed.status_code == 204,
            removed_completed.text,
        )

        removed_open = client.delete(
            f"/api/tasks/{open_task['id']}", headers=removal_headers
        )
        check(
            "an open task can be removed",
            removed_open.status_code == 204,
            removed_open.text,
        )

        remaining = client.get(
            "/api/routines", params={"local_date": TODAY}, headers=removal_headers
        )
        removal_after = next(
            (
                routine
                for routine in remaining.json()
                if routine["id"] == removal_payload["id"]
            ),
            None,
        )
        check(
            "removed tasks disappear from the routine",
            removal_after is not None and removal_after["tasks"] == [],
            removal_after,
        )
        check(
            "deleting an already-removed task returns 404",
            client.delete(
                f"/api/tasks/{completed_task['id']}", headers=removal_headers
            ).status_code
            == 404,
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
