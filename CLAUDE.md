# CLAUDE.md — PPG Pulse

## What we're building
PPG Pulse is a delivery & performance cockpit for **VAYUZ People Group (PPG)** — the
recruitment team. It replaces a set of spreadsheets (a PPG self-reported Q1 sheet and
the official HDIS requirement master) with a real multi-user web product.

There is a working single-file HTML **prototype** (`prototype/ppg-pulse.html`) that
demonstrates every screen and the intended look & feel. **Match its UX and data shapes.**
This project turns that prototype into a production app with a real backend, auth,
database, file storage, and shared multi-user state.

## Modules (all already prototyped)
- **Home / PPG Report** — team overview (KPI tiles + charts) and per-consultant report,
  with Consultant / FY / Month / From–To filters. Drill into a requirement.
- **Interviews** — month calendar with per-day counts; per-day mid-day & end-day logs;
  consultant-wise breakdown.
- **HDIS** — requirement master: monthly listing, add/edit form (owners multiselect,
  JD link + PDF/DOC attachment), detail view with a **pipeline recorder** (R0–R5 counts
  + stage/status) and a full **activity log**.
- **My Team** — pod members; click a person to open their PPG report.
- **Profile** — account, role, access summary.
- **Admin** — Users (assign role, reporting line, per-user permission overrides),
  Roles & Access (custom role builder), Team Hierarchy (org tree).

## RBAC (see SPEC.md for the matrix)
Roles: `super_admin` (Co-Founder), `hr_manager` (Admin), `consultant`.
- Super Admin: everything.
- HR Manager: everything **except** editing Super Admin accounts/credentials; can create
  more HR Managers; HR Managers can report to other HR Managers.
- Consultant: sees only **their own + team** data; HDIS read-only; no admin.
- Per-user **overrides** grant one capability of one section outside the role rules.
- Data **scope** is `org` / `team` / `own`; `team` walks the reporting tree.

## Tech stack (use exactly this unless a task says otherwise)
- **Monorepo**: `/server` and `/web`, npm workspaces. Node 20 LTS, TypeScript everywhere.
- **Backend**: Fastify + TypeScript, Prisma ORM, **PostgreSQL** (use a local Postgres via
  Docker; SQLite is allowed only if Postgres is unavailable and a task says so).
  Auth: JWT access + refresh, `argon2` password hashing. Validation: `zod`.
  File storage: local disk (`/server/uploads`) in dev behind a `StorageService`
  interface so S3 can drop in later.
- **Frontend**: React 18 + Vite + TypeScript + Tailwind. Charts: Chart.js via
  `react-chartjs-2`. Data fetching: TanStack Query. Router: React Router.
  Reuse the prototype's design tokens (colors, spacing, the ABC KPI tiles, the chart
  cards, the dark sidebar) — see `prototype/ppg-pulse.html`.
- **Testing**: Vitest + Supertest/`fastify.inject` for API; React Testing Library for
  components; Playwright for e2e. **Every endpoint and every permission rule gets a test.**
- **Tooling**: ESLint + Prettier, `tsc --noEmit` typecheck, Husky pre-commit running
  lint+typecheck on staged files.

## The `verify` gate (Definition of Done for each task)
Root `package.json` must expose:
```
npm run verify   # runs, in order: typecheck → lint → test → build (server + web)
```
A task is DONE only when its acceptance criteria are met AND `npm run verify` is green.

## Global Definition of Done (stop condition for the loop)
1. Every task in `TASKS.md` is `[x]`.
2. `npm run verify` passes with zero errors and no skipped tests.
3. `docker compose up` (db) + `npm run dev` boots server + web with no console errors.
4. `npm run seed` loads the demo data (13 users, 10 consultants, 145 requirements,
   138 HDIS records) and the seeded login works.
5. Playwright e2e green for the 6 critical flows in `TASKS.md` Phase 13.
6. `README.md` documents setup, env vars, scripts, and the RBAC model.
7. `BLOCKERS.md` is empty (or contains only items explicitly deferred with the human's
   sign-off noted).

## Conventions
- **Security first**: authorize on the server for *every* request; never trust the client
  for scope or role. Scope filtering happens in the query layer.
- Return typed DTOs; never leak password hashes or internal fields.
- All list endpoints support the period filter (`from`,`to`,`month`,`fy`) where relevant.
- Log every HDIS mutation to `hdis_activity` with actor + timestamp + diff.
- Money/counts are integers; dates are ISO `YYYY-MM-DD`; timestamps are UTC ISO.
- Seed data derives from the prototype (a `seed.json` is provided in `/server/prisma`).
- Keep the prototype accessible at `/prototype` (static) for visual reference during dev.
- Prefer feature folders: `server/src/modules/<name>/{routes,service,repo,schema,tests}`.

## Files that drive the loop
- `TASKS.md` — the backlog (source of truth for progress).
- `PROGRESS.md` — append-only log of completed tasks (create if missing).
- `BLOCKERS.md` — questions/blockers (create if missing).
- `SPEC.md` — data model, RBAC matrix, API contracts, acceptance details.
