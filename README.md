# Routinery — turn your daily routine into competitiveness

A full-stack routine habit game: build a daily checklist with a time for every task, check in near
that time to earn coins and ELO, spend the coins on themes, upload your own profile picture, and climb
a six-tier leaderboard based on timing accuracy.

* **Frontend** — React 18 + TypeScript + Vite + Tailwind (dark by default, `#FFFFFF` text)
* **Backend** — Python 3.12 + FastAPI + SQLAlchemy
* **Auth** — Supabase (email/password **and** Google OAuth) with an offline dev provider fallback
* **Scoring** — local-time check-ins scored against each task's scheduled time

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
* Smoke test (timing rewards, 30-minute spacing, shop, ladder, reports): `cd backend && python tests/smoke_test.py`

> The dev provider creates real password hashes and real JWTs, but it is meant for local use.
> Set `DEV_AUTH=false` before you ship.

---

## 2. Hooking up Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. Open **Settings → API Keys** (or the **Connect** dialog) and copy the values into `backend/.env`:

```env
SUPABASE_URL=https://YOUR-PROJECT.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_...  # browser-safe
SUPABASE_SECRET_KEY=sb_secret_...            # server only, never in the frontend
SUPABASE_JWT_SECRET=your-jwt-secret          # Project Settings → API → JWT Settings
SUPABASE_STORAGE_BUCKET=proofs               # public bucket for profile pictures
```

The legacy names `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` work too — either pair is
enough.

3. **Authentication → Providers → Google**: enable it and paste the Client ID / Secret from
   [Google Cloud Console](https://console.cloud.google.com/apis/credentials).
   Add the redirect URL Supabase shows you to *Authorised redirect URIs* in Google Cloud.
4. **Authentication → URL Configuration**: set *Site URL* to `http://localhost:5173` and add
   `http://localhost:5173/auth/callback` to *Redirect URLs*. When you deploy, also add the Vercel
   project URL and `https://YOUR-APP.vercel.app/auth/callback`.
5. Put your Postgres connection string in `backend/.env` so data lives in Supabase. On Vercel use
   the **Session pooler** URI (IPv4-compatible), not the direct `db.*.supabase.co` host:

```env
DATABASE_URL=postgresql://postgres.YOUR-PROJECT-REF:YOUR-DB-PASSWORD@aws-0-REGION.pooler.supabase.com:5432/postgres
```

The API accepts `postgresql://` or `postgres://` and normalises it to the psycopg driver, so you can
paste Supabase's string verbatim. URL-encode special characters in the password.

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

## 3. Timing accuracy

Every task stores a local wall-clock `scheduled_time` (`HH:MM`). When the user ticks a task, the
browser sends its local time and date, and the API compares the two:

| Difference from schedule | ELO | Coins |
| --- | --- | --- |
| 0 minutes | +50 | task coin value |
| 10 minutes | +48 | task coin value |
| 20 minutes | +45 | task coin value |
| 21 minutes | −10 | none |
| 60 minutes | −18 | none |
| 120+ minutes | −30 | none |

ELO is clamped to the published ladder floor/ceiling (100–2400). Un-ticking a task reverses the
actual coins and ELO it granted. A **perfect day** requires every task to be checked in on time and
pays +200 coins (+5 per streak day, capped at +50).

Tasks must be at least **30 minutes apart**, measured on the daily clock (so `23:50` and `00:10`
collide) and across every routine on the account. The API rejects new routines, added tasks, and
retimed tasks that break the gap; the builder and quick-add form check it before submitting too.

---

## 4. Economy and ranks (exactly as specified)

| Reward | Coins | ELO |
| --- | --- | --- |
| On-time task (within 20 min) | task value (10 by default) | **+45 to +50** |
| Late task (more than 20 min off) | — | **−10 to −30** |
| **Perfect on-time routine** | **+200** (+5/day streak bonus, capped at +50) | — |

| Tier | ELO range |
| --- | --- |
| Copper | 100 – 500 |
| Bronze | 500 – 800 |
| Silver | 800 – 1200 |
| Gold | 1200 – 1600 |
| Platinum | 1600 – 2000 |
| Ruby | 2000 – 2400 |

Prices: colour themes **10,000**, meme/image themes **20,000**, custom profile picture uploads
**100 per change**, light + dark themes free, first username free, later username changes **400**
(taken names are refused). Colour themes repaint the full surface palette; image themes add a
foreground artwork panel and a stronger page backdrop.
Coins and ELO are only ever moved server-side (`backend/app/economy.py`), and every movement is
written to `ledger_entries`. The reward stored on a completion is the *applied* delta, so reversing
a task at the ELO floor cannot award free points.

---

## 5. What is in the app

| Screen | Route | What it does |
| --- | --- | --- |
| Landing | `/` | "Turn your daily routine into competitiveness" + sign up / login + tier ladder |
| Sign up | `/signup` | Email, password, confirm password, optional username, Google OAuth button |
| Log in | `/login` | Email + password, Google OAuth button, dev-provider notice |
| Onboarding | `/onboarding` | Claim the free first username (live availability check) + optional picture upload |
| Routine | `/app` | Today's timed checklist, per-task timing rewards, streak + progress |
| Reports | `/reports` | Rolling last 3 days / weekly / last month summary, daily rhythm, timing, routine breakdown |
| Builder | `/routines/new` | Name, templates, per-task time and coin value |
| Shop | `/shop` | 12 themes, buy/equip, affordability checks (profile pictures are uploaded) |
| Ladder | `/leaderboard` | Top 50 by ELO / coins / streak + your own position |
| Profile | `/profile` | Stats, username change, picture upload, coin/ELO ledger, timing rules |

New accounts start with **no routine** and are sent straight to the builder after claiming a
username.

---

## 6. Project layout

```
backend/
  app/
    main.py            FastAPI app, CORS, static uploads, routers
    config.py          settings from .env
    database.py        engine/session, SQLite + Postgres + additive migrations
    models.py          profiles, routines, tasks, completions, shop, ledger
    economy.py         ELO tiers, timing rewards, perfect-day pipeline, streaks
    auth.py            Supabase/dev token verification + profile provisioning
    serializers.py     rows -> API payloads
    routers/           auth_dev, profile, routines, shop, leaderboard
    services/          storage and legacy verification helpers
  tests/smoke_test.py  end-to-end API smoke test (auth, timing, uploads, shop, ladder)
frontend/
  src/lib/             supabase.ts, authClient.ts, api.ts, themes.ts, types.ts, time.ts
  src/state/           AuthContext, ThemeContext, ToastContext
  src/components/      UI kit, AppLayout, AuthShell, TaskRow, RewardBurst, ProtectedRoute
  src/pages/           Landing, Login, Signup, AuthCallback, Onboarding, Routine, Builder,
                       Shop, Leaderboard, Profile
supabase/schema.sql    the same schema as raw SQL
mobile/
  android/             Bubblewrap TWA project (package com.advikchaba.routinery)
  release/             signed release APK and Play Store AAB
  README.md            Android build, signing, and Play Console notes
```

### API surface (all under `/api`)

```
GET    /me                      profile + rank + stats
POST   /me/username             claim/change username (400 coins after the first)
POST   /me/avatar/upload        upload a custom profile picture (100 coins per change)
GET    /me/ledger               coin + ELO history
GET    /routines                routines with today's completion state (?local_date=YYYY-MM-DD)
GET    /reports                 rolling report (?range=3d|week|month&local_date=YYYY-MM-DD)
POST   /routines                create a routine (tasks include scheduled_time)
PATCH  /routines/{id}           rename a routine
POST   /routines/{id}/tasks     quick-add a timed task
PATCH  /tasks/{id}              edit a task (title, time, coin value)
DELETE /tasks/{id}              remove a task
POST   /tasks/{id}/complete     tick a task with {local_time, local_date}
DELETE /tasks/{id}/complete     un-tick and reverse its coins/ELO (?local_date=YYYY-MM-DD)
GET    /shop                    catalog with owned/equipped flags
POST   /shop/{slug}/buy         spend coins
POST   /shop/{slug}/equip       equip an owned cosmetic
GET    /leaderboard             ladder (?metric=elo|coins|matches_won|streak)
```

---

## 7. Deploy on Vercel + Supabase

The repo deploys as **one Vercel project** containing two [Vercel Services](https://vercel.com/docs/services):
a Vite frontend and a FastAPI backend. The root `vercel.json` declares both services and routes
`/api/*` to FastAPI while every other path goes to the Vite app. Both share one domain, so the
frontend calls `/api` same-origin — no backend URL, CORS setup, or `VITE_API_URL` is needed.

> Vercel shows these as **services inside one project**, not as two projects. If you already created
> a separate backend project, delete it. The frontend and backend must live in the same project for
> the shared-domain routing to work.

### Create or convert the project

The project is `routinery` with the canonical production domain
`https://routinery-advik-chaba.vercel.app`. The `routinery-sigma.vercel.app` alias redirects to it so
browsers keep one login session. If you are converting an existing frontend project, keep the domain
and Supabase redirect URLs aligned:

1. Open the project → **Settings → General**.
2. Set **Root Directory** to the repository root (`.`), not `frontend` or `backend`.
3. Set **Framework Preset** to **Services**. The root `vercel.json` defines the two services.
4. Clear any project-level **Build Command**, **Output Directory**, or **Install Command** overrides.
   Each service builds itself.
5. Remove `VITE_API_URL` and any project-level backend variables from the old frontend project, then
   add the variables below at the project level. The two public Supabase values are also exposed to
   Vite as `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` so auth works before `/api/config` loads.
6. Redeploy. If Vercel does not show the **Services** preset, make sure `vercel.json` is on `main`
   and redeploy; Services is in beta but available on all plans.

To start fresh instead, use **Add New → Project**, import this repo, and apply the same settings.
A new project gets a new domain, so update the Supabase URLs and `FRONTEND_ORIGIN` below.

### Environment variables

Add these at the **project** level for Production and Preview. Vercel makes them available to both
services; Vite only exposes variables prefixed with `VITE_`, so the secret key never reaches the
browser bundle.

| Variable | Value |
| --- | --- |
| `ENVIRONMENT` | `production` |
| `FRONTEND_ORIGIN` | `https://routinery-advik-chaba.vercel.app` (canonical project domain) |
| `EXTRA_ORIGINS` | Custom frontend domains, comma-separated (optional) |
| `DATABASE_URL` | Supabase **Session pooler** connection string (optional; without it the backend persists SQLite in the private `routinery-data` bucket) |
| `SUPABASE_URL` | `https://YOUR-PROJECT.supabase.co` |
| `SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_...` (or `SUPABASE_ANON_KEY`) |
| `SUPABASE_SECRET_KEY` | `sb_secret_...` (or `SUPABASE_SERVICE_ROLE_KEY`) |
| `SUPABASE_STORAGE_BUCKET` | `proofs` (public bucket used for uploaded profile pictures) |
| `SUPABASE_JWT_SECRET` | Optional; blank verifies tokens against Supabase Auth |
| `DEV_AUTH` | `false` |
| `DEV_JWT_SECRET` | A long random string |
| `SEED_DEMO_PLAYERS` | `false` |
| `VITE_SUPABASE_URL` | Same value as `SUPABASE_URL` |
| `VITE_SUPABASE_ANON_KEY` | Same value as `SUPABASE_PUBLISHABLE_KEY` |

Do **not** set `VITE_API_URL` for the one-project setup. Leave it unset/blank so the frontend uses
same-origin `/api`. The frontend can also load the public Supabase config from `GET /api/config` at
runtime, but setting the two `VITE_` values above means the Supabase client is ready even if that
request is slow.

### Verify the deployment

Open:

```text
https://routinery-advik-chaba.vercel.app/api/health
```

It should report `"auth":"supabase"`, `"storage":"supabase"`, and `"persist":"supabase-storage"` when
`DATABASE_URL` is unset. Then:

```text
https://routinery-advik-chaba.vercel.app/api/config
```

`supabase_configured` must be `true`. If `/api/health` returns the frontend HTML, the root
`vercel.json` was not applied — check the root directory, the Services preset, and redeploy.

### Supabase Auth URLs

In Supabase **Authentication → URL Configuration**, set *Site URL* to
`https://routinery-advik-chaba.vercel.app` and add
`https://routinery-advik-chaba.vercel.app/auth/callback` to *Redirect URLs*. Keep the localhost URLs
for development. The `routinery-sigma.vercel.app` alias redirects to the canonical host and preserves
query strings, but using the canonical URL everywhere avoids an extra redirect during OAuth and email
confirmation. If you use a custom domain, add it to `EXTRA_ORIGINS` and to Supabase's redirect
allowlist.

### What runs where

| Piece | Host |
| --- | --- |
| React app | Vercel service `frontend` |
| FastAPI | Vercel service `backend` (`backend/`) |
| Profiles, routines, tasks, coins, ELO | Supabase Postgres, or the private Supabase Storage SQLite fallback when `DATABASE_URL` is unset |
| Uploaded profile pictures | Supabase Storage bucket (`SUPABASE_STORAGE_BUCKET`, under `avatars/`) |
| Auth | Supabase Auth (email/password + Google) |

### Notes

* The function limit for the FastAPI service is 60 seconds, set under `services.backend.functions`
  in the root `vercel.json`. `backend/.vercelignore` keeps local databases, uploads, and tests out
  of the backend build.
* Supabase projects on the free plan pause after inactivity; the first request after a pause can be
  slow.
* The API creates tables, adds new columns to existing tables, and syncs the shop catalogue on each
  cold start; all operations are idempotent. Use the Session pooler so serverless instances do not
  exhaust Postgres connections.

---

## 8. Android app (Play Store)

`mobile/` contains a Trusted Web Activity wrapper for the canonical production site. It opens the
deployed app in Chrome and uses the same backend, auth, and data as the website.

* Package: `com.advikchaba.routinery`
* Version: `1.0.0` (version code `1`)
* Signed APK: `mobile/release/routinery-1.0.0-release.apk`
* Play Store bundle: `mobile/release/routinery-1.0.0-release.aab`

The Digital Asset Links file is deployed at
`https://routinery-advik-chaba.vercel.app/.well-known/assetlinks.json`. If Google Play App Signing
uses a different app signing certificate, add that SHA-256 fingerprint to
`frontend/public/.well-known/assetlinks.json` and redeploy before testing the Play-signed build.

See [`mobile/README.md`](mobile/README.md) for signing-key custody, rebuild steps, and the Play
Console checklist.
