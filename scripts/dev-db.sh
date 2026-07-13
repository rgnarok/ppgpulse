#!/usr/bin/env bash
# Dev/CI helper: run a local PostgreSQL 16 cluster without Docker.
# Usage: scripts/dev-db.sh [start|stop|status]
# Creates a cluster under .pgdata, listens on 127.0.0.1:5432 (trust auth),
# and ensures the ppgpulse + ppgpulse_test databases exist.
set -euo pipefail

PGBIN="${PGBIN:-/usr/lib/postgresql/16/bin}"
PGDATA="${PGDATA:-$(cd "$(dirname "$0")/.." && pwd)/.pgdata}"
PGUSER_SYS="postgres"
CMD="${1:-start}"

run_pg() { sudo -u "$PGUSER_SYS" "$@"; }

start() {
  if [ ! -f "$PGDATA/PG_VERSION" ]; then
    mkdir -p "$PGDATA"
    chown -R "$PGUSER_SYS":"$PGUSER_SYS" "$PGDATA"
    run_pg "$PGBIN/initdb" -D "$PGDATA" -U postgres --auth=trust >/tmp/initdb.log 2>&1
  fi
  chown -R "$PGUSER_SYS":"$PGUSER_SYS" "$PGDATA"
  rm -f "$PGDATA/postmaster.pid"
  if ! run_pg "$PGBIN/pg_ctl" -D "$PGDATA" status >/dev/null 2>&1; then
    run_pg "$PGBIN/pg_ctl" -D "$PGDATA" -o "-p 5432 -k /tmp" -l /tmp/pg.log start
    sleep 2
  fi
  run_pg "$PGBIN/psql" -p 5432 -h /tmp -tc "SELECT 1 FROM pg_database WHERE datname='ppgpulse'" \
    | grep -q 1 || run_pg "$PGBIN/createdb" -p 5432 -h /tmp ppgpulse
  run_pg "$PGBIN/psql" -p 5432 -h /tmp -tc "SELECT 1 FROM pg_database WHERE datname='ppgpulse_test'" \
    | grep -q 1 || run_pg "$PGBIN/createdb" -p 5432 -h /tmp ppgpulse_test
  echo "postgres up on 127.0.0.1:5432 (ppgpulse, ppgpulse_test)"
}

case "$CMD" in
  start) start ;;
  stop) run_pg "$PGBIN/pg_ctl" -D "$PGDATA" stop -m fast || true ;;
  status) run_pg "$PGBIN/pg_ctl" -D "$PGDATA" status || true ;;
  *) echo "usage: $0 [start|stop|status]"; exit 1 ;;
esac
