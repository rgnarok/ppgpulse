#!/usr/bin/env sh
set -e

# The server ensures schema + seed on boot (in-process). Just start it.
cd /app
echo "Starting PPG Pulse API on :${PORT:-4000}"
exec node server/dist/server.js
