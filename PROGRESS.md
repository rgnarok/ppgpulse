# PROGRESS.md — PPG Pulse (append-only)

Log of completed tasks: date · task id · what shipped.

- 2026-07-13 · T0.1 · Monorepo npm workspaces (server+web), root verify gate (typecheck→lint→test→build), trivial passing tests in each workspace.
- 2026-07-13 · T0.2 · ESLint (flat) + Prettier + Husky pre-commit running lint-staged & typecheck.
- 2026-07-13 · T0.3 · docker-compose Postgres, .env.example, zod-validated config module (throws on missing/invalid env) + tests.
- 2026-07-13 · T1.1 · Prisma schema (all SPEC §1 models, enums, indexes) + init migration; schema/migration test on temp DB.
- 2026-07-13 · T1.2 · Idempotent seed (3 roles+perms, 13 users argon2, 10 consultants, 145 requirements, 138 HDIS+owners+zeroed pipeline); npm run seed/reset; counts + Kushagra super_admin tests.
