# Routinery — turn your daily routine into competitiveness

A full-stack routine habit game: build a daily checklist, tick tasks off for coins, spend them on
themes and profile pictures, and race other players up a six-tier ELO ladder where every claim has to
survive photo verification.

* **Frontend** — React 18 + TypeScript + Vite + Tailwind (dark by default, `#FFFFFF` text)
* **Backend** — Python 3.12 + FastAPI + SQLAlchemy
* **Auth** — Supabase (email/password **and** Google OAuth) with an offline dev provider fallback
* **Verification** — pluggable photo verifier (vision model, or a human review queue)

---

## 1. Quickstart (no accounts needed)

Runs fully offline with SQLite and a local auth provider. Two terminals:

```bash
# Terminal 1 — API
cd backend
python -m venv .venv && .venv\Scripts\activate      # Windows
# source .venv/bin/activate                          # macOS / Linux
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000

# Terminal 2 — web app
cd frontend
npm install
npm run dev
```

Open <http://localhost:5173>. Sign up with any email (e.g. `me@routinery.dev`) and you are in.

* API docs: <http://localhost:8000/docs>
* Health check: <http://localhost:8000/api/health>
* Smoke test (60 assertions over the full product loop): `cd backend && python tests/smoke_test.py`

> The dev provider creates real password hashes and real JWTs, but it is meant for local use.
> Set `DEV_AUTH=false` before you ship.

---

## 2. Hooking up Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. **Project Settings → API** and copy three values into `backend/.env`:

```env
SUPABASE_URL=https://YOUR-PROJECT.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOi...        # safe to expose, it is the public key
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOi... # server only, never in the frontend
SUPABASE_JWT_SECRET=your-jwt-secret     # Project Settings → API → JWT Settings
```

3. **Authentication → Providers → Google**: enable it and paste the Client ID / Secret from
   [Google Cloud Console](https://console.cloud.google.com/apis/credentials).
   Add the redirect URL Supabase shows you to *Authorised redirect URIs* in Google Cloud.
4. **Authentication → URL Configuration**: set *Site URL* to `http://localhost:5173` and add
   `http://localhost:5173/auth/callback` to *Redirect URLs*.
5. Put your Postgres connection string in `backend/.env` so data lives in Supabase:

```env
DATABASE_URL=postgresql+psycopg://postgres:YOUR-DB-PASSWORD@db.YOUR-PROJECT-REF.supabase.co:5432/postgres
```

The API creates every table on boot. `supabase/schema.sql` is the same schema as raw SQL if you
prefer to run it in the Supabase SQL editor.

**How auth flows through the stack**

| Step | Where |
| --- | --- |
| Sign up / log in / Google OAuth | `frontend/src/lib/supabase.ts` (Supabase JS) |
| Token stored + refreshed | Supabase client (`persistSession`, `autoRefreshToken`) |
| Token sent to API | `frontend/src/lib/api.ts` → `Authorization: Bearer <token>` |
| Token verified | `backend/app/auth.py` (local JWT secret, else Supabase `/auth/v1/user`) |
| Profile row created on first request | `backend/app/auth.py::provision_profile` |

The frontend never branches on which auth provider is active: `frontend/src/lib/authClient.ts`
picks Supabase when it is configured and the dev provider otherwise.

---

## 3. Photo verification

`POST /api/tasks/{id}/proof` and `POST /api/ranked/matches/{id}/proof` take a JPEG/PNG/WebP photo
plus the claimed task, then run `backend/app/services/vision.py`:

| `VISION_PROVIDER` | Behaviour |
| --- | --- |
| `mock` (default) | Validates the file really is an image and auto-approves (great for local dev) |
| `openai` | Sends the photo to any OpenAI-compatible vision endpoint and reads back `{verified, confidence, reason}` |
| `off` | Every proof goes to the human review queue |

To turn on real verification:

```env
VISION_PROVIDER=openai
VISION_API_KEY=sk-...
VISION_MODEL=gpt-4o-mini
VISION_BASE_URL=https://api.openai.com/v1
```

Anything the verifier is unsure about becomes `pending` instead of being rejected, and lands in the
moderator queue:

```env
ADMIN_EMAILS=you@example.com
```

* `GET  /api/admin/proofs?status=pending` — review queue with images
* `POST /api/admin/proofs/{id}/review` — `{"approve": true}` pays the reward, `false` reverses it

---

## 4. Economy and ranks (exactly as specified)

| Reward | Coins | ELO |
| --- | --- | --- |
| Complete a task | +10 (per-task value) | — |
| Photo-verified task | +25 (+10 bonus at high confidence) | — |
| **Perfect routine** | **+200** (+5/day streak bonus, capped at +50) | **+50** |
| Win a ranked race | +200 | +50 |
| Lose a ranked race | +10 | −15 (floored at 100) |

| Tier | ELO range |
| --- | --- |
| Copper | 100 – 500 |
| Bronze | 500 – 800 |
| Silver | 800 – 1200 |
| Gold | 1200 – 1600 |
| Platinum | 1600 – 2000 |
| Ruby | 2000 – 2400 |

Prices: colour themes **10,000**, meme/image themes **20,000**, profile pictures **600**, light +
dark themes free, first username free, later username changes **400** (taken names are refused).
Coins and ELO are only ever moved server-side (`backend/app/economy.py`), and every movement is
written to `ledger_entries`. Un-ticking a task reverses its coins so the checklist can't be farmed.

---

## 5. What is in the app

| Screen | Route | What it does |
| --- | --- | --- |
| Landing | `/` | "Turn your daily routine into competitiveness" + sign up / login + tier ladder |
| Sign up | `/signup` | Email, password, confirm password, optional username, Google OAuth button |
| Log in | `/login` | Email + password, Google OAuth button, dev-provider notice |
| Onboarding | `/onboarding` | Claim the free first username (live availability check) |
| Routine | `/app` | Today's checklist, coin/ELO rewards, photo proof per task, streak + rank progress |
| Builder | `/routines/new` | Name, icon, templates, per-task coin value and proof requirement |
| Ranked | `/ranked` | Queue or join by code, live scoreboard, per-item photo proofs, result modal |
| Shop | `/shop` | 13 themes + 18 avatars, buy/equip, affordability checks |
| Ladder | `/leaderboard` | Top 50 by ELO / coins / wins / streak + your own position |
| Profile | `/profile` | Stats, username change, coin ledger, proof gallery |

---

## 6. Project layout

```
backend/
  app/
    main.py            FastAPI app, CORS, static uploads, routers
    config.py          settings from .env
    database.py        engine/session, SQLite + Postgres
    models.py          profiles, routines, tasks, completions, shop, matches, proofs
    economy.py         ELO tiers, payouts, perfect-day pipeline, streaks
    auth.py            Supabase/dev token verification + profile provisioning
    serializers.py     rows -> API payloads
    routers/           auth_dev, profile, routines, shop, ranked, leaderboard(+admin)
    services/          vision.py (verification), proofs.py (rewards), storage.py (uploads)
  tests/smoke_test.py  end-to-end API walkthrough
frontend/
  src/lib/             supabase.ts, authClient.ts, api.ts, themes.ts, types.ts
  src/state/           AuthContext, ThemeContext, ToastContext
  src/components/      UI kit, AppLayout, AuthShell, TaskRow, RewardBurst, ProtectedRoute
  src/pages/           Landing, Login, Signup, AuthCallback, Onboarding, Routine, Builder,
                       Ranked, Shop, Leaderboard, Profile
supabase/schema.sql    the same schema as raw SQL
```

### API surface (all under `/api`)

```
GET    /me                      profile + rank + stats
POST   /me/username             claim/change username (400 coins after the first)
GET    /me/ledger               coin + ELO history
GET    /me/proofs               your uploaded proofs
GET    /routines                routines with today's completion state
POST   /routines                create a routine (with tasks)
POST   /tasks/{id}/complete     tick a task (+coins, perfect-day bonus)
DELETE /tasks/{id}/complete     un-tick (reverses rewards)
POST   /tasks/{id}/proof        upload photo proof -> verification
GET    /shop                    catalog with owned/equipped flags
POST   /shop/{slug}/buy         spend coins
POST   /shop/{slug}/equip       equip an owned cosmetic
POST   /ranked/queue            find an opponent / open a race
POST   /ranked/join             join with a 6-character code
GET    /ranked/matches/{id}     live race state
POST   /ranked/matches/{id}/proof  photo-verify a race item
DELETE /ranked/matches/{id}     cancel or forfeit
GET    /leaderboard             ladder (?metric=elo|coins|matches_won|streak)
GET    /admin/proofs            moderator review queue
```

---

## 7. Deployment notes

* Set `DEV_AUTH=false`, a strong `DEV_JWT_SECRET`, and `ENVIRONMENT=production` (the demo ladder is
  never seeded in production).
* Serve `frontend/dist` from any static host; set `VITE_API_URL` to the API origin and add that
  origin to `EXTRA_ORIGINS` on the backend.
* Move uploads off local disk (`backend/app/services/storage.py` has one place to change) to S3 or
  Supabase Storage for multi-instance deployments.
* Rate-limit `/tasks/{id}/proof` and `/ranked/*/proof` at your reverse proxy — that's the only
  expensive endpoint.
