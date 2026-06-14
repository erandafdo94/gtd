# Focus Router

A tiny single-page web app for sit-down focus. Tap your energy, tap how much
time you have, and it routes you into a mode (Deep Work / Steady / Knock-outs)
plus one of your pre-defined projects, then runs a focus timer.

Projects, focus sessions, journal entries, saved words, and the current "main
task" are persisted to a backend keyed on your Google account, so the same data
follows you across devices. Theme preference and the Wikipedia "On This Day"
cache stay local to each browser.

## Stack

- **Frontend**: React 18 + Vite + TypeScript, plain React with inline styles
- **Backend**: ASP.NET Core 10 Minimal APIs, EF Core, Npgsql
- **Database**: Postgres 16 (a local instance on `:5432`)
- **Auth**: Google OAuth (ID-token flow) → app-issued JWT

## Develop

### Prereqs

- Node 20+
- .NET 10 SDK
- Postgres 16 running locally on `:5432`
- A Google OAuth 2.0 Client ID (Web application, with `http://localhost:5173`
  in **Authorized JavaScript origins**). Create one at
  <https://console.cloud.google.com/apis/credentials>.

> The backend lives in `../backend/` (its own git repo). The frontend and
> backend are separate repos that sit side-by-side under `gtd/`.

### One-time setup

```bash
# Frontend deps
npm install

# Local Postgres — create the database on your :5432 instance. The default
# connection string lives in backend/FocusRouter.Api/appsettings.json.
createdb -h localhost -p 5432 -U postgres focus   # or: CREATE DATABASE focus;

# Backend schema applies automatically on `dotnet run` (Program.cs migrates on
# startup). To apply it manually instead:
cd ../backend
dotnet ef database update --project FocusRouter.Api

# Configure the Google client id
dotnet user-secrets --project FocusRouter.Api \
  set "Google:ClientId" "YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com"

cd ../frontend
```

Frontend env:

```bash
cp .env.example .env
# then fill in VITE_GOOGLE_CLIENT_ID (same client id as above)
```

### Run

Two terminals:

```bash
# Terminal 1 — API at http://localhost:5080
cd ../backend
dotnet run --project FocusRouter.Api

# Terminal 2 — SPA at http://localhost:5173 (proxies /api → :5080)
npm run dev
```

### Build

```bash
# from frontend/
npm run build                                          # static SPA in dist/
# from backend/
dotnet publish FocusRouter.Api -c Release              # API binaries
```

## Data

All per-user data is stored in Postgres, scoped by user id. The following
tables back the API: `users`, `user_flags`, `projects`, `parked_tasks`,
`sessions`, `main_tasks`, `saved_words`, `journal_entries`. See
[../specs/001-backend-auth/plan.md](../specs/001-backend-auth/plan.md) for the
full data model and endpoint contract.

Two things still live in the browser's `localStorage` on purpose:

- `focus_theme` — your dark/light preference is per-device, not per-account.
- `focus_otd` — a cache of today's Wikipedia "On This Day" event (refetched
  daily; nothing to sync).

The auth token is also held in `localStorage` under `focus_auth_token`.

If you used the pre-backend version of the app, your existing `localStorage`
data is uploaded to the server on first sign-in (one-shot) and then the
legacy keys are cleared. If the server already has data for your account, the
local copy is discarded — server data wins.

## Spec-driven development

This project uses [GitHub Spec Kit](https://github.com/github/spec-kit). The
current feature spec, implementation plan, and tasks list live in the parent
workspace at [../specs/001-backend-auth/](../specs/001-backend-auth).

## Deploy (Railway)

Three services in the same Railway project:

1. **Postgres** — add Railway's Postgres plugin. It exposes `DATABASE_URL` to
   any service in the project that references it.
2. **API** — service deployed from the `backend` repo (separate from this
   one — `../backend/` in the workspace). Root dir: repo root. Builder:
   Dockerfile (auto-detected). Variables:
   - `DATABASE_URL` — `${{Postgres.DATABASE_URL}}` (reference)
   - `Jwt__Secret` — a long random string
   - `Jwt__Issuer`, `Jwt__Audience` — e.g. `focus-router`
   - `Google__ClientId` — your Google OAuth client id
   - `CORS_ORIGINS` — the public URL of this frontend service
   - Migrations run automatically on container start.
3. **Frontend** — service deployed from this repo (Nixpacks autodetects Vite,
   no Dockerfile needed).
   - Variables (set at **build time**):
     - `VITE_GOOGLE_CLIENT_ID` — same Google OAuth client id as the API
     - `VITE_API_BASE_URL` — the public URL of the API service
   - Add the frontend's public URL to your Google OAuth client's **Authorized
     JavaScript origins** in Google Cloud Console.

For local runs against the Railway Postgres, set `DATABASE_PUBLIC_URL` in
your environment — the internal `*.railway.internal` host won't resolve from
a laptop.
