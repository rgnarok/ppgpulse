# PPG Pulse

A delivery & performance cockpit for **VAYUZ People Group (PPG)** — the recruitment team.
It replaces spreadsheets (a self-reported Q1 sheet and the HDIS requirement master) with a
real multi-user web product: team & per-consultant reporting, an interviews calendar, the
HDIS requirement master with a pipeline recorder, and full admin (users, roles, hierarchy).

Built from the single-file prototype in [`prototype/ppg-pulse.html`](prototype/ppg-pulse.html),
which stays available at `/prototype` for visual reference.

## Stack

- **Monorepo** — npm workspaces: [`/server`](server) and [`/web`](web). Node 20 LTS, TypeScript.
- **Backend** — Fastify 5 + Prisma + **PostgreSQL**. JWT access/refresh (rotation), `argon2`
  password hashing, `zod` validation, local-disk file storage behind a `StorageService`.
- **Frontend** — React 18 + Vite + TypeScript + Tailwind, Chart.js (`react-chartjs-2`),
  TanStack Query, React Router. Design tokens ported from the prototype.
- **Testing** — Vitest + `fastify.inject` (API), React Testing Library (components),
  Playwright (e2e). Every endpoint and permission rule is tested.

## Prerequisites

- Node.js 20 (`>=20 <23`)
- One of: Docker (for Postgres via `docker compose`) **or** a local PostgreSQL 16.

## Quick start (local dev)

```bash
# 1. Install
npm install

# 2. Start Postgres (Docker)
docker compose up -d db

# 3. Configure env
cp .env.example .env          # then also: cp .env server/.env
#   defaults already point at the docker-compose Postgres

# 4. Create the schema + demo data
npm run db:push -w server     # or: npm run migrate -w server
npm run seed                  # 3 roles, 13 users, 10 consultants, 145 requirements, 138 HDIS

# 5. Run server + web (http://localhost:5173, API on :4000)
npm run dev
```

Log in with any seeded email and the dev password **`Passw0rd!`**, e.g.
`kushagra@vayuz.com` (Super Admin), `aarti@vayuz.com` (HR Manager),
`abha@vayuz.com` (Consultant).

## Deploy a public link (Render)

The repo ships a [Render Blueprint](render.yaml) — a single Docker image serving the
API + web, plus a managed Postgres.

1. Push this repo to GitHub (already done for the working branch).
2. In [Render](https://render.com): **New → Blueprint**, connect the repo, pick the branch.
3. Render reads `render.yaml`, provisions Postgres, generates the JWT secrets, builds the
   Docker image, and deploys.
4. On boot the container runs `prisma migrate deploy` and seeds the demo data, then serves
   the app at `https://<service>.onrender.com`.

Log in with `kushagra@vayuz.com` / `Passw0rd!` (or any seeded user). `WEB_ORIGIN` defaults to
Render's external URL automatically, so it works single-origin with no extra config.

> Free-tier notes: the web service sleeps after inactivity (first request cold-starts), and
> the free Postgres/instance disk are ephemeral — fine for a demo, not for real data.

## Deploy the frontend to Vercel (API on Render)

Vercel hosts the **web** app; the **API + Postgres** run on Render (Vercel can't run a
persistent server or a database). Two steps:

**1. API on Render** — deploy the Blueprint as above. Note its URL, e.g.
`https://ppg-pulse.onrender.com`. (In this split the API only needs to serve `/api`; it
still serves its own web copy too, which is harmless.)

**2. Web on Vercel** — the repo has [`vercel.json`](vercel.json) configured for the monorepo:

- Import the repo at [vercel.com](https://vercel.com) → **New Project** → pick this repo/branch.
- Vercel reads `vercel.json` (install `npm ci`, build `npm run build -w web`, output `web/dist`,
  SPA rewrites). Leave the framework as detected/none.
- Add an **Environment Variable**: `VITE_API_BASE_URL = https://<your-render-api>.onrender.com`
  (the value is baked into the build).
- Deploy → your app is live at `https://<project>.vercel.app`.

CORS is already handled: the API accepts any `*.vercel.app` origin (plus localhost and the
configured `WEB_ORIGIN`), so preview and production deployments both work. Auth uses bearer
tokens (no cookies), so no extra cross-site config is needed.

> Note: HDIS attachment **download** links open the API directly; since downloads require a
> bearer token, use them from the same session. All other features work fully cross-origin.

## Run the whole stack in Docker

```bash
docker compose up --build
# → API + web served single-origin at http://localhost:4000
```

The `app` container applies migrations and seeds on boot (`SEED_ON_BOOT=true`).

## Environment variables

Documented in [`.env.example`](.env.example). The server validates these on boot (via `zod`)
and refuses to start if any required value is missing/invalid.

| Var | Required | Description |
|-----|----------|-------------|
| `DATABASE_URL` | ✅ | Postgres connection string |
| `TEST_DATABASE_URL` | for tests | Separate DB used by the test suite |
| `JWT_SECRET` | ✅ | Access-token signing secret (≥16 chars) |
| `JWT_REFRESH_SECRET` | ✅ | Refresh-token signing secret (≥16 chars) |
| `JWT_ACCESS_TTL` / `JWT_REFRESH_TTL` | | Token lifetimes (default `15m` / `7d`) |
| `WEB_ORIGIN` | ✅ | Allowed CORS origin |
| `UPLOAD_DIR` | | Attachment storage root (default `./uploads`) |
| `MAX_UPLOAD_BYTES` | | Max upload size (default 10 MB) |
| `PORT` | | API port (default `4000`) |

## Scripts

| Command | What it does |
|---------|--------------|
| `npm run dev` | Server + web in watch mode |
| `npm run build` | Build server + web |
| `npm run verify` | **Definition of Done** — typecheck → lint → test → build |
| `npm run test` | Unit + integration tests (both workspaces) |
| `npm run seed` | Load demo data (idempotent) |
| `npm run reset -w server` | Drop + migrate + seed |
| `npm run e2e` | Build, then Playwright's 6 critical flows |

## RBAC model

Roles: `super_admin` (Co-Founder), `hr_manager` (Admin), `consultant`.

Sections: `home, interviews, hdis, myteam, profile, users, roles, hierarchy`.
Capabilities: `view, add, edit, delete`.

- **Super Admin** — everything.
- **HR Manager** — everything **except** managing Super Admin accounts (cannot edit/delete/
  reassign/reset-password a `super_admin`, nor edit the protected `super_admin` role). May
  create more HR Managers.
- **Consultant** — sees only their **own + team** data; HDIS read-only; no admin.

**Effective permissions = role permissions ∪ per-user overrides.** Overrides only *grant*;
they never bypass the Super-Admin-protection safety rules.

**Data scope** is `org` / `team` / `own`. `team` resolves to the user's name + their reporting
subtree + same-team peers (cycle-safe). All list/report endpoints filter by scope **in the
query layer** — the client is never trusted for scope or role.

See [`SPEC.md`](SPEC.md) for the full data model, RBAC matrix, and API contracts, and
[`TASKS.md`](TASKS.md) / [`PROGRESS.md`](PROGRESS.md) for the build backlog and changelog.

## Security

Server-side authorization on every request; typed DTOs (never leak password hashes); JWT
refresh rotation with logout invalidation; login rate-limiting; helmet; CORS locked to
`WEB_ORIGIN`; upload MIME + size validation; secrets redacted from logs; every HDIS mutation
audit-logged with actor + timestamp + diff.

## CI

[`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs `verify` (with a Postgres service)
and the Playwright e2e suite on every push/PR.
