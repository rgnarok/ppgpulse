# PROGRESS.md — PPG Pulse (append-only)

Log of completed tasks: date · task id · what shipped.

- 2026-07-13 · T0.1 · Monorepo npm workspaces (server+web), root verify gate (typecheck→lint→test→build), trivial passing tests in each workspace.
- 2026-07-13 · T0.2 · ESLint (flat) + Prettier + Husky pre-commit running lint-staged & typecheck.
- 2026-07-13 · T0.3 · docker-compose Postgres, .env.example, zod-validated config module (throws on missing/invalid env) + tests.
