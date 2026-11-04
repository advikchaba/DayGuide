"""Reproduce: newly added friend missing from GET /friends (Your friends tab)."""

from __future__ import annotations

import os
import sys
import tempfile
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
    SEED_DEMO_PLAYERS="false",
    SUPABASE_URL="",
    SUPABASE_ANON_KEY="",
    SUPABASE_PUBLISHABLE_KEY="",
    SUPABASE_SERVICE_ROLE_KEY="",
    SUPABASE_SECRET_KEY="",
    SUPABASE_STORAGE_BUCKET="",
    UPLOAD_DIR=str(Path(tempfile.gettempdir()) / f"routinery-repro-{uuid.uuid4().hex[:8]}"),
)

from fastapi.testclient import TestClient  # noqa: E402

from app.config import settings  # noqa: E402

settings.supabase_url = ""
settings.supabase_anon_key = ""
settings.supabase_publishable_key = ""
settings.seed_demo_players = False

from app.main import app  # noqa: E402


def signup(client: TestClient, username: str) -> dict:
    r = client.post(
        "/api/auth/dev/signup",
        json={"email": f"{username}-{uuid.uuid4().hex[:6]}@routinery.dev", "password": "sup3rsecret!", "username": username},
    )
    assert r.status_code == 201, r.text
    return r.json()


def main() -> None:
    with TestClient(app) as client:
        alice = signup(client, "AliceUser")
        bob = signup(client, "BobUser")
        h_alice = {"Authorization": f"Bearer {alice['access_token']}"}
        h_bob = {"Authorization": f"Bearer {bob['access_token']}"}

        print("\n== search ==")
        found = client.get("/api/friends/search", params={"q": "BobUser"}, headers=h_alice)
        print("search status:", found.status_code, found.json())

        print("\n== send request ==")
        sent = client.post("/api/friends/request", json={"username": "BobUser"}, headers=h_alice)
        print("send status:", sent.status_code, sent.text)

        print("\n== pending for bob ==")
        pending = client.get("/api/friends/requests/pending", headers=h_bob)
        print("pending status:", pending.status_code, pending.json())

        print("\n== alice's friends BEFORE accept ==")
        before = client.get("/api/friends", headers=h_alice)
        print("status:", before.status_code, before.json())

        print("\n== bob accepts ==")
        req_id = pending.json()[0]["id"]
        accept = client.post(f"/api/friends/requests/{req_id}/accept", headers=h_bob)
        print("accept status:", accept.status_code, accept.text)

        print("\n== bob's friends AFTER accept ==")
        bob_friends = client.get("/api/friends", headers=h_bob)
        print("status:", bob_friends.status_code, bob_friends.json())

        print("\n== alice's friends AFTER accept ==")
        alice_friends = client.get("/api/friends", headers=h_alice)
        print("status:", alice_friends.status_code, alice_friends.json())

        print("\n== every endpoint the page's load() calls (as alice) ==")
        for path in (
            "/api/friends/requests/pending",
            "/api/friends",
            "/api/friends/common-routines",
            "/api/friends/duels",
        ):
            r = client.get(path, headers=h_alice)
            print(f"{path}: {r.status_code} {r.text[:300]}")

        print("\n== re-send request (should 409 already friends) ==")
        resend = client.post("/api/friends/request", json={"username": "BobUser"}, headers=h_alice)
        print("resend status:", resend.status_code, resend.text)

        print("\n== bob adds a THIRD user, then check bob's list ==")
        carol = signup(client, "CarolUser")
        s2 = client.post("/api/friends/request", json={"username": "CarolUser"}, headers=h_bob)
        print("bob->carol send:", s2.status_code, s2.text)
        p2 = client.get("/api/friends/requests/pending", headers=carol and {"Authorization": f"Bearer {carol['access_token']}"})
        print("carol pending:", p2.status_code, p2.json())
        if p2.status_code == 200 and p2.json():
            a2 = client.post(f"/api/friends/requests/{p2.json()[0]['id']}/accept", headers={"Authorization": f"Bearer {carol['access_token']}"})
            print("carol accept:", a2.status_code, a2.text)
        bob_after = client.get("/api/friends", headers=h_bob)
        print("bob friends now:", bob_after.status_code, bob_after.json())


if __name__ == "__main__":
    try:
        main()
    finally:
        if DB_PATH.exists():
            try:
                DB_PATH.unlink()
            except PermissionError:
                pass
