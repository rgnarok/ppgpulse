# PROGRESS.md — PPG Pulse (append-only)

Log of completed tasks: date · task id · what shipped.

- 2026-07-13 · T0.1 · Monorepo npm workspaces (server+web), root verify gate (typecheck→lint→test→build), trivial passing tests in each workspace.
- 2026-07-13 · T0.2 · ESLint (flat) + Prettier + Husky pre-commit running lint-staged & typecheck.
- 2026-07-13 · T0.3 · docker-compose Postgres, .env.example, zod-validated config module (throws on missing/invalid env) + tests.
- 2026-07-13 · T1.1 · Prisma schema (all SPEC §1 models, enums, indexes) + init migration; schema/migration test on temp DB.
- 2026-07-13 · T1.2 · Idempotent seed (3 roles+perms, 13 users argon2, 10 consultants, 145 requirements, 138 HDIS+owners+zeroed pipeline); npm run seed/reset; counts + Kushagra super_admin tests.
- 2026-07-13 · T2.1 · argon2 password hash/verify + JWT access/refresh sign/verify with rotation (RefreshToken model); tests incl. expired-token rejection.
- 2026-07-13 · T2.2 · Fastify app (helmet/cors/rate-limit/multipart/static prototype), auth plugin, POST /auth/login|refresh|logout + GET /me (effective perms+scope); good/bad login, /me shape, rotation, logout-invalidation tests.
- 2026-07-13 · T2.3 · RBAC engine: can()/effectivePermissions (role ∪ overrides), scopeUserIds/scopeNames (org/team/own, cycle-safe subtree), HR-cannot-touch-super_admin + role-edit guards; full SPEC §2 matrix tests.
- 2026-07-13 · T3.1 · Users API (list/get/create/patch/delete) with users.view/edit authz, super_admin protection, hashed passwords, no hash leakage.
- 2026-07-13 · T3.2 · Per-user overrides (grant/revoke) + reporting-line PATCH with self/descendant cycle guard.
- 2026-07-13 · T3.3 · Roles API CRUD; system/protected guarded; delete reassigns users to consultant.
- 2026-07-13 · T3.4 · Hierarchy API GET /hierarchy org tree (cycle-safe); consultant forbidden.
- 2026-07-13 · T4.1 · GET /consultants scoped (super=10, Pod A consultant=4).
- 2026-07-13 · T4.2 · resolvePeriod util (from/to > month > default all-Q1) + inPeriod; unit tests.
- 2026-07-13 · T4.3 · GET /report/overview — 7 tiles (incl. RADC/RADF closure split) + 4 chart series, scoped+period. Super all-Q1 verified 145/14(6·3)/36/11/3/10.
- 2026-07-13 · T4.4 · GET /report/consultant/:id (confidence+factors, kpi, R0–R5 funnel, requirements) + GET /requirements/:id (detail + co-owners); metric ports unit-tested; out-of-scope → 403.
