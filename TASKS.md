# TASKS.md — PPG Pulse build backlog

Rules: do tasks top-to-bottom; a task is ready when its **Deps** are all `[x]`.
Mark `[x]` only when every **AC** (acceptance criterion) holds and `npm run verify` is
green. Keep this file updated — it is the loop's source of truth.

Legend: **AC** = acceptance criteria, **Tests** = tests to write, **Deps** = dependencies.

---

## Phase 0 — Scaffold & tooling
- [x] **T0.1 Monorepo scaffold.** Deps: none.
  AC: npm workspaces with `/server` + `/web`; root scripts `dev`, `build`, `test`,
  `lint`, `typecheck`, `verify`(=typecheck→lint→test→build); Node 20 engines pin.
  Tests: a trivial passing unit test in each workspace so `verify` runs green.
- [x] **T0.2 Lint/format/hooks.** Deps: T0.1. AC: ESLint+Prettier configured, Husky
  pre-commit runs lint+typecheck on staged files; `npm run lint` clean.
- [x] **T0.3 Docker Postgres + env.** Deps: T0.1. AC: `docker-compose.yml` with Postgres;
  `.env.example` documents `DATABASE_URL`, `JWT_SECRET`, `JWT_REFRESH_SECRET`,
  `WEB_ORIGIN`, `UPLOAD_DIR`; server reads env via a validated config module.
  Tests: config module throws on missing required env (unit).

## Phase 1 — Database & seed
- [x] **T1.1 Prisma schema.** Deps: T0.3. AC: all models in SPEC §1 with relations,
  enums, indexes; `prisma migrate dev` creates the schema cleanly.
  Tests: schema compiles; a migration test spins up a temp DB and applies migrations.
- [x] **T1.2 Seed.** Deps: T1.1. AC: `npm run seed` loads `prisma/seed.json` →
  3 roles + role permissions, 13 users (pw `Passw0rd!` argon2), 10 consultants,
  145 requirements, 138 HDIS (+owners, +zeroed pipeline). Idempotent. `npm run reset` works.
  Tests: after seed, counts assert 13/10/145/138; Kushagra = super_admin.

## Phase 2 — Auth & RBAC core
- [x] **T2.1 Password + JWT services.** Deps: T1.2. AC: argon2 hash/verify; sign/verify
  access+refresh; refresh rotation. Tests: hash roundtrip, expired token rejected.
- [x] **T2.2 Auth routes.** Deps: T2.1. AC: `POST /auth/login|refresh|logout`, `GET /me`
  returns user + effective permissions + scope. Tests: good/bad login, /me shape,
  refresh rotates, logout invalidates.
- [x] **T2.3 RBAC engine.** Deps: T2.1. AC: `can(user, section, cap)` = rolePerms ∪
  overrides; `scopeNames(user)` resolves org/team (subtree + peers); `assert(...)`
  middleware. **HR-cannot-touch-super_admin** guard implemented here.
  Tests: matrix from SPEC §2 verified for all 3 roles; override grants; HR blocked from
  super_admin target; consultant scope = self+pod only; cycle-safe subtree walk.

## Phase 3 — Admin API
- [x] **T3.1 Users API.** Deps: T2.3. AC: list/create/patch/delete with authz + the
  super_admin protection; password never returned. Tests: HR edits consultant OK; HR
  edits super_admin → 403; consultant → 403 on all.
- [x] **T3.2 Overrides + reporting line.** Deps: T3.1. AC: `POST /users/:id/overrides`,
  `PATCH /users/:id/manager` with cycle guard. Tests: override changes `can()`; cycle → 400.
- [x] **T3.3 Roles API.** Deps: T2.3. AC: CRUD custom roles; system/protected guarded;
  deleting a role reassigns its users to `consultant`. Tests: create/edit custom role;
  edit protected role as HR → 403; delete reassigns.
- [x] **T3.4 Hierarchy API.** Deps: T3.1. AC: `GET /hierarchy` returns org tree.
  Tests: tree roots + nesting correct from seed.

## Phase 4 — Report API
- [x] **T4.1 Consultants (scoped).** Deps: T2.3. AC: `GET /consultants` returns only
  in-scope consultants. Tests: super=10, consultant=own pod (e.g. 4).
- [x] **T4.2 Period filter util.** Deps: T1.2. AC: `resolvePeriod({from,to,month,fy})`
  → `{lo,hi}` (default all-Q1 2025-12-01..2026-06-30). Tests: month→range; from/to wins;
  default range.
- [x] **T4.3 Overview endpoint.** Deps: T4.1,T4.2. AC: `GET /report/overview` returns
  the 7 tile values (incl. RADC/RADF closure split) + 4 chart series, scoped + period.
  Tests: super all-Q1 → 145 reqs, 14 closures (6 RADC·3 RADF), 36 insights, 11 events,
  3 participated, 10 consultants; consultant scoped smaller; May filter narrows.
- [x] **T4.4 Consultant report + requirement detail.** Deps: T4.2. AC:
  `GET /report/consultant/:id` → confidence(+factors), kpi, funnel R0–R5, requirements;
  `GET /requirements/:id` → detail + co-owners. Tests: confidence/kpi match prototype
  formulas within rounding; out-of-scope consultant → 403.

## Phase 5 — HDIS API
- [x] **T5.1 HDIS CRUD + list.** Deps: T2.3. AC: monthly list, create/edit/delete with
  perms; owners multi (HdisOwner rows). Tests: list by month; consultant create → 403;
  admin create → 201.
- [x] **T5.2 Activity log.** Deps: T5.1. AC: every create/edit/delete writes HdisActivity
  with actor+diff; `GET /hdis/:jdId/activity`. Tests: edit produces a diff entry.
- [x] **T5.3 Pipeline recorder.** Deps: T5.2. AC: `PUT /hdis/:jdId/pipeline` updates
  r0–r5 + stage, syncs status (Closed/On Hold/Active), logs a "pipeline update" activity
  with the field diffs. Tests: R1 2→3 logged; stage Closed → status Closed.
- [x] **T5.4 JD link + attachment.** Deps: T5.2. AC: `POST /hdis/:jdId/link`;
  `POST /hdis/:jdId/attachments` (multipart, mime+size validated, StorageService);
  authorized download. Tests: reject .exe/oversize; upload+download roundtrip; link set.

## Phase 6 — Interviews API
- [x] **T6.1 Interviews API.** Deps: T2.3. AC: month counts; day get(mid/end +
  consultant-wise); add/patch/delete (perm interviews.edit). Tests: add row appears in
  day + month count; consultant can edit; scope of `ppgConsultantId` list respected.

## Phase 7 — Web shell & auth
- [x] **T7.1 Web scaffold + design tokens.** Deps: T0.2. AC: Vite React TS + Tailwind;
  port the prototype's tokens (dark sidebar, ABC tiles, chart cards, fonts). Tests: a
  component render test.
- [x] **T7.2 Auth flow + API client.** Deps: T7.1,T2.2. AC: login page, token storage,
  TanStack Query client with auth + refresh; `useMe()`. Tests: login redirects; 401
  triggers refresh then retry.
- [x] **T7.3 App shell + RBAC nav.** Deps: T7.2,T2.3. AC: left sidebar + topbar; nav
  items filtered by `can(section,'view')`; role/user context; logout. (No "PPG Report"
  item — Home is the report.) Tests: consultant sees no Admin items.

## Phase 8 — Web: Home report
- [x] **T8.1 Filter bar.** Deps: T7.3,T4.2. AC: Consultant / FY / Month / From / To /
  "All Q1"; drives queries. Tests: changing month refetches with range.
- [x] **T8.2 Overview (tiles + charts).** Deps: T8.1,T4.3. AC: 7 ABC tiles + 4 Chart.js
  charts matching the prototype; bar click opens that consultant. Tests: renders tiles
  from mocked API; click handler navigates.
- [x] **T8.3 Consultant view + requirement drilldown.** Deps: T8.1,T4.4. AC: gauge +
  factor rings + funnel + requirements table; row → requirement detail; empty-period
  state. Tests: renders from mocked API; empty state shows.

## Phase 9 — Web: Interviews
- [x] **T9.1 Interviews UI.** Deps: T7.3,T6.1. AC: month calendar w/ counts; day panels
  (mid/end) editable inline; consultant-wise view; read-only when lacking edit.
  Tests: add row persists via API; read-only hides inputs.

## Phase 10 — Web: HDIS
- [x] **T10.1 HDIS list + monthly.** Deps: T7.3,T5.1. AC: month pills + table + activity
  feed; add button gated. Tests: list renders; consultant sees no add/edit.
- [x] **T10.2 HDIS form.** Deps: T10.1,T5.4. AC: fields + **owners multiselect (chips)** +
  **JD link input + PDF/DOC upload**; validation. Tests: add/remove owner chip; upload
  calls API; save creates record.
- [x] **T10.3 HDIS detail + pipeline recorder.** Deps: T10.2,T5.3. AC: banner + owners +
  attachment/link + **R0–R5 inputs & stage/status "Log update"** + per-record activity
  log. Tests: pipeline save posts + shows new activity; read-only shows values only.

## Phase 11 — Web: People
- [x] **T11.1 My Team.** Deps: T7.3,T4.1. AC: scoped member cards; click a consultant →
  opens their Home report with filters. Tests: click sets consultant + routes to Home.
- [x] **T11.2 Profile.** Deps: T7.3,T2.2. AC: account + role + access summary + (for
  consultants) personal stats. Tests: renders access grid from /me.

## Phase 12 — Web: Admin
- [x] **T12.1 Users admin.** Deps: T7.3,T3.2. AC: table with role/team/manager editors +
  overrides; super_admin rows locked for HR. Tests: HR cannot edit super_admin row.
- [x] **T12.2 Roles admin.** Deps: T7.3,T3.3. AC: role cards + permission-matrix builder.
  Tests: create custom role updates nav for assigned users.
- [x] **T12.3 Hierarchy.** Deps: T7.3,T3.4. AC: org tree view. Tests: renders seed tree.

## Phase 13 — E2E, hardening, deploy
- [x] **T13.1 Playwright e2e (6 flows).** Deps: all web+api. AC: (1) login; (2) super sees
  overview 145/14; (3) consultant scoped + no admin; (4) HDIS add→edit→pipeline update
  logged; (5) JD upload+download; (6) HR blocked from super_admin edit. All green.
- [x] **T13.2 Security pass.** Deps: T13.1. AC: helmet, CORS, auth rate-limit, refresh
  rotation, upload mime/size, no secrets in logs; `npm audit` no high/critical.
  Tests: rate-limit test; unauthorized endpoint access → 401/403 across a sampled matrix.
- [x] **T13.3 CI + README + deploy.** Deps: T13.2. AC: GitHub Actions runs `verify` +
  e2e on PR; `README.md` (setup, env, scripts, RBAC); Dockerfiles for server+web;
  `docker compose up` runs the whole stack. Tests: CI green on a clean checkout.

---

## Done when
All boxes above are `[x]`, `npm run verify` green, e2e green, `BLOCKERS.md` empty,
seeded demo runs. Then write the final report (see KICKOFF.md).
