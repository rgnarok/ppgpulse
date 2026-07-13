#!/usr/bin/env sh
set -e

# Apply migrations (idempotent) and optionally seed on boot, then start the API.
cd /app/server
echo "Applying database migrations…"
npx prisma migrate deploy

if [ "${SEED_ON_BOOT:-true}" = "true" ]; then
  echo "Seeding database (idempotent)…"
  npx tsx prisma/seed.ts || echo "seed skipped"
fi

cd /app
echo "Starting PPG Pulse API on :${PORT:-4000}"
exec node server/dist/server.js
