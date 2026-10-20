"""End-to-end smoke test for the Routinery API.

Runs the real FastAPI app against a throwaway SQLite database and walks through
the whole product loop: signup -> routine -> rewards -> shop -> proof
verification -> ranked race -> leaderboard.

Usage:
    python tests/smoke_test.py
"""

from __future__ import annotations

import os
import sys
import uuid
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
    VISION_PROVIDER="mock",
    AUTO_APPROVE_PROOFS="true",
    SEED_DEMO_PLAYERS="true",
    UPLOAD_DIR=str(ROOT / "test_uploads"),
    # Force the offline provider even when a developer has real Supabase
    # credentials in backend/.env.
    SUPABASE_URL="",
    SUPABASE_ANON_KEY="",
    SUPABASE_PUBLISHABLE_KEY="",
    SUPABASE_SERVICE_ROLE_KEY="",
    SUPABASE_SECRET_KEY="",
    SUPABASE_STORAGE_BUCKET="",
)

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402

PASSED: list[str] = []


def check(label: str, condition: bool, detail: object = "") -> None:
    if not condition:
        raise AssertionError(f"FAILED: {label} -> {detail}")
    PASSED.append(label)
    print(f"  ok  {label}")


def jpeg_bytes(size: int = 6_000) -> bytes:
    # Minimal valid JPEG header followed by filler so the size heuristic passes.
    return b"\xff\xd8\xff\xe0" + b"\x00" * size


def signup(client: TestClient, email: str, password: str = "sup3rsecret!") -> dict:
    response = client.post("/api/auth/dev/signup", json={"email": email, "password": password})
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

        print("\n== auth ==")
        email = f"player-{uuid.uuid4().hex[:8]}@routinery.dev"
        session = signup(client, email)
        token = session["access_token"]
        check("signup returns token + profile", session["profile"]["coins"] == 100, session["profile"])
        check("signup starts at Copper", session["profile"]["rank"]["name"] == "Copper", session["profile"]["rank"])
        check("starter routine provisioned", session["profile"]["username"] is None)

        me = client.get("/api/me", headers=auth(token)).json()
        check("me endpoint works", me["email"] == email, me)

        check(
            "duplicate email rejected",
            client.post("/api/auth/dev/signup", json={"email": email, "password": "anotherpass1"}).status_code == 409,
        )
        check(
            "bad password rejected",
            client.post("/api/auth/dev/login", json={"email": email, "password": "nope"}).status_code == 401,
        )
        relog = client.post("/api/auth/dev/login", json={"email": email, "password": "sup3rsecret!"})
        check("login works", relog.status_code == 200, relog.text)

        print("\n== username ==")
        availability = client.get("/api/usernames/available", params={"username": "RaceKing"}).json()
        check("username availability check", availability["available"] is True, availability)

        updated = client.post("/api/me/username", json={"username": "RaceKing"}, headers=auth(token)).json()
        check("first username is free", updated["username"] == "RaceKing" and updated["coins"] == 100, updated)

        blocked = client.post("/api/me/username", json={"username": "SomeoneElse"}, headers=auth(token))
        check("username change costs 400 coins", blocked.status_code == 400, blocked.text)

        print("\n== routines + rewards ==")
        routines = client.get("/api/routines", headers=auth(token)).json()
        check("routine list", len(routines) == 1, routines)
        routine = routines[0]
        wanted = 0
        for task in routine["tasks"]:
            body = client.post(f"/api/tasks/{task['id']}/complete", headers=auth(token)).json()
            wanted += body["reward"]["coins"] if body["reward"]["perfect"] else 0
            if body["reward"]["perfect"]:
                reward = body["reward"]
            else:
                reward = None

        check("perfect routine awarded", reward is not None and reward["perfect"] is True, reward)
        check("perfect routine paid 200+ coins", reward["perfect_coins"] >= 200, reward)
        check("perfect routine paid 50 ELO", reward["perfect_elo"] == 50, reward)

        me = client.get("/api/me", headers=auth(token)).json()
        check("ELO moved to 150", me["elo"] == 150, me["elo"])
        check("still Copper at 150 ELO", me["rank"]["name"] == "Copper", me["rank"])
        check("streak started", me["streak"] == 1, me["streak"])

        # Un-tick reverses rewards so nobody farms the checklist.
        first_task = routine["tasks"][0]["id"]
        undone = client.delete(f"/api/tasks/{first_task}/complete", headers=auth(token)).json()
        check("un-tick reports negative reward", undone["reward"]["coins"] < 0, undone["reward"])
        after = client.get("/api/me", headers=auth(token)).json()
        check("coins reverted on un-tick", after["coins"] < me["coins"], (after["coins"], me["coins"]))
        check("ELO reverted on un-tick", after["elo"] == 100, after["elo"])

        # Put the task back for the rest of the flow.
        client.post(f"/api/tasks/{first_task}/complete", headers=auth(token))

        print("\n== custom routine with photo tasks ==")
        created = client.post(
            "/api/routines",
            headers=auth(token),
            json={
                "name": "Ranked Sprint",
                "emoji": "🏁",
                "tasks": [
                    {"title": "20 push ups", "requires_proof": True},
                    {"title": "Read 10 pages", "requires_proof": True},
                ],
            },
        ).json()
        check("routine created", created["name"] == "Ranked Sprint" and len(created["tasks"]) == 2, created)

        proof_task = created["tasks"][0]["id"]
        result = client.post(
            f"/api/tasks/{proof_task}/proof",
            headers=auth(token),
            files={"file": ("proof.jpg", jpeg_bytes(), "image/jpeg")},
            data={"note": "done at the gym"},
        ).json()
        check("photo proof auto-verified", result["approved"] is True, result)
        check("verified task paid 25 coins", result["proof"]["coins_awarded"] == 25, result["proof"])
        check("proof status approved", result["proof"]["status"] == "approved", result["proof"])

        rejected = client.post(
            f"/api/tasks/{proof_task}/proof",
            headers=auth(token),
            files={"file": ("notes.txt", b"hello world", "text/plain")},
        )
        check("non-image rejected by verifier", rejected.status_code == 400, rejected.text)

        print("\n== shop ==")
        shop = client.get("/api/shop", headers=auth(token)).json()
        themes = [item for item in shop["items"] if item["kind"] == "theme"]
        avatars = [item for item in shop["items"] if item["kind"] == "avatar"]
        check("shop has 13 themes", len(themes) == 13, len(themes))
        check("colour themes cost 10k", all(t["price"] == 10_000 for t in themes if t["rarity"] == "rare"), themes)
        check("meme themes cost 20k", all(t["price"] == 20_000 for t in themes if t["rarity"] == "epic"), themes)
        check("avatars cost 600", all(a["price"] == 600 for a in avatars if not a["is_free"]), avatars)
        check("dark + light are free", {"dark", "light"} <= {t["slug"] for t in themes if t["is_free"]})

        poor = client.post("/api/shop/blue/buy", headers=auth(token))
        check("cannot afford 10k theme yet", poor.status_code == 400, poor.text)

        equipped = client.post("/api/me/theme", json={"slug": "light"}, headers=auth(token)).json()
        check("free theme equippable", equipped["theme_slug"] == "light", equipped)
        client.post("/api/me/theme", json={"slug": "dark"}, headers=auth(token))

        locked = client.post("/api/shop/flame/equip", headers=auth(token))
        check("cannot equip unowned avatar", locked.status_code == 403, locked.text)

        print("\n== ranked race ==")
        second = signup(client, f"rival-{uuid.uuid4().hex[:6]}@routinery.dev")
        token_b = second["access_token"]
        client.post("/api/me/username", json={"username": "RivalRita"}, headers=auth(token_b))

        match = client.post("/api/ranked/queue", headers=auth(token), json={"routine_id": created["id"]}).json()
        check("race opened with a code", match["status"] == "waiting" and len(match["code"]) == 6, match)
        check("race mirrors the routine tasks", len(match["tasks"]) == 2, match["tasks"])

        joined = client.post("/api/ranked/join", headers=auth(token_b), json={"code": match["code"]}).json()
        check("opponent joined", joined["status"] == "active" and len(joined["players"]) == 2, joined)

        elo_before = client.get("/api/me", headers=auth(token)).json()["elo"]
        coins_before = client.get("/api/me", headers=auth(token)).json()["coins"]

        v1 = client.post(
            f"/api/ranked/matches/{match['id']}/proof",
            headers=auth(token),
            files={"file": ("a.jpg", jpeg_bytes(), "image/jpeg")},
            data={"match_task_id": str(match["tasks"][0]["id"])},
        ).json()
        check("first race item verified", v1["approved"] is True, v1)
        check("race still running at 1/2", v1["match"]["status"] == "active", v1["match"]["status"])

        v2 = client.post(
            f"/api/ranked/matches/{match['id']}/proof",
            headers=auth(token),
            files={"file": ("b.jpg", jpeg_bytes(), "image/jpeg")},
            data={"match_task_id": str(match["tasks"][1]["id"])},
        ).json()
        check("race finished on completion", v2["match"]["status"] == "finished", v2["match"]["status"])
        check("winner recorded", v2["match"]["winner_id"] is not None, v2["match"]["winner_id"])

        after_me = client.get("/api/me", headers=auth(token)).json()
        check("winner gained 50 ELO", after_me["elo"] == elo_before + 50, (elo_before, after_me["elo"]))
        check("winner gained 200 coins", after_me["coins"] >= coins_before + 200, (coins_before, after_me["coins"]))
        check("win counted", after_me["matches_won"] == 1, after_me["matches_won"])

        loser = client.get("/api/me", headers=auth(token_b)).json()
        check("loser lost ELO but never below floor", loser["elo"] == 100, loser["elo"])

        repeat = client.post(
            f"/api/ranked/matches/{match['id']}/proof",
            headers=auth(token),
            files={"file": ("c.jpg", jpeg_bytes(), "image/jpeg")},
            data={"match_task_id": str(match["tasks"][0]["id"])},
        )
        check("cannot re-submit after race ended", repeat.status_code == 409, repeat.text)

        print("\n== buying cosmetics ==")
        broke = client.post("/api/shop/flame/buy", headers=auth(token)).json()
        check("cannot buy without enough coins", "more coins" in broke["detail"], broke)

        granted = client.post("/api/auth/dev/grant", json={"coins": 40_000}, headers=auth(token)).json()
        check("dev grant tops up the wallet", granted["coins"] >= 40_000, granted["coins"])

        client.post("/api/shop/flame/buy", headers=auth(token))
        me = client.get("/api/me", headers=auth(token)).json()
        check("avatar bought and auto-equipped", me["avatar_slug"] == "flame", me["avatar_slug"])

        coins_before_theme = me["coins"]
        client.post("/api/shop/blue/buy", headers=auth(token))
        me = client.get("/api/me", headers=auth(token)).json()
        check("10k theme unlocked", me["theme_slug"] == "blue", me["theme_slug"])
        check("theme charged 10,000 coins", me["coins"] == coins_before_theme - 10_000, me["coins"])

        client.post("/api/shop/meme-doge/buy", headers=auth(token))
        me = client.get("/api/me", headers=auth(token)).json()
        check("20k meme theme unlocked", me["theme_slug"] == "meme-doge", me["theme_slug"])

        again = client.post("/api/shop/meme-doge/buy", headers=auth(token))
        check("cannot buy the same item twice", again.status_code == 400, again.text)

        owned_theme = client.post("/api/shop/blue/equip", headers=auth(token)).json()
        check("owned theme re-equippable", owned_theme["theme_slug"] == "blue", owned_theme["theme_slug"])

        print("\n== leaderboard ==")
        board = client.get("/api/leaderboard", headers=auth(token)).json()
        check("ladder populated", len(board["entries"]) >= 10, len(board["entries"]))
        check("elite player is Ruby", board["entries"][0]["rank_name"] == "Ruby", board["entries"][0])
        check("my row is included", board["you"] is not None and board["you"]["username"] == "RaceKing", board["you"])
        check("sorted by ELO", board["entries"][0]["elo"] >= board["entries"][-1]["elo"])

        coins_board = client.get("/api/leaderboard", params={"metric": "coins"}, headers=auth(token)).json()
        check("coins ladder works", coins_board["entries"][0]["coins"] >= coins_board["entries"][-1]["coins"])

        print("\n== review queue (admin) ==")
        check(
            "admin queue is protected",
            client.get("/api/admin/proofs", headers=auth(token)).status_code == 403,
        )

        print(f"\nAll {len(PASSED)} checks passed.")


if __name__ == "__main__":
    try:
        main()
    finally:
        import shutil

        if DB_PATH.exists():
            try:
                DB_PATH.unlink()
            except PermissionError:
                pass
        shutil.rmtree(ROOT / "test_uploads", ignore_errors=True)
