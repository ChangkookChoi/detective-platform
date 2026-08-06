#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WEB_DIR="$ROOT_DIR/apps/web"
PG_E2E_PORT="${PG_E2E_PORT:-55435}"
PG_E2E_ROOT=""
PG_BIN=""
PG_DATABASE="detective_platform_e2e"

find_postgres() {
  if command -v pg_config >/dev/null 2>&1; then
    PG_BIN="$(pg_config --bindir)"
    return
  fi

  if command -v brew >/dev/null 2>&1; then
    local brew_prefix
    brew_prefix="$(brew --prefix postgresql@17 2>/dev/null || true)"

    if [[ -n "$brew_prefix" && -x "$brew_prefix/bin/pg_config" ]]; then
      PG_BIN="$brew_prefix/bin"
      return
    fi
  fi

  echo "PostgreSQL 17+ is required. Install postgresql@17 or add pg_config to PATH." >&2
  exit 1
}

cleanup() {
  if [[ -n "$PG_E2E_ROOT" && -f "$PG_E2E_ROOT/data/postmaster.pid" ]]; then
    "$PG_BIN/pg_ctl" -D "$PG_E2E_ROOT/data" -m fast -w stop >/dev/null
  fi

  case "$PG_E2E_ROOT" in
    */detective-platform-e2e-pg.*)
      rm -r -- "$PG_E2E_ROOT"
      ;;
    "")
      ;;
    *)
      echo "Refusing to remove unexpected temporary path: $PG_E2E_ROOT" >&2
      exit 1
      ;;
  esac
}

find_postgres

version_number="$($PG_BIN/pg_config --version | sed -E 's/.* ([0-9]+).*/\1/')"
if (( version_number < 17 )); then
  echo "PostgreSQL 17 or newer is required." >&2
  exit 1
fi

if ! [[ "$PG_E2E_PORT" =~ ^[0-9]+$ ]] ||
  (( PG_E2E_PORT < 1024 || PG_E2E_PORT > 65535 )); then
  echo "PG_E2E_PORT must be an integer from 1024 through 65535." >&2
  exit 1
fi

if "$PG_BIN/pg_isready" -h 127.0.0.1 -p "$PG_E2E_PORT" >/dev/null 2>&1; then
  echo "Port $PG_E2E_PORT is already serving PostgreSQL." >&2
  echo "Set PG_E2E_PORT to another port." >&2
  exit 1
fi

PG_E2E_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/detective-platform-e2e-pg.XXXXXX")"
trap cleanup EXIT INT TERM

"$PG_BIN/initdb" \
  -D "$PG_E2E_ROOT/data" \
  --encoding=UTF8 \
  --locale=C \
  --auth=trust \
  --no-instructions >/dev/null

"$PG_BIN/pg_ctl" \
  -D "$PG_E2E_ROOT/data" \
  -l "$PG_E2E_ROOT/postgres.log" \
  -o "-h 127.0.0.1 -k $PG_E2E_ROOT -p $PG_E2E_PORT" \
  -w start >/dev/null

"$PG_BIN/createdb" \
  -h 127.0.0.1 \
  -p "$PG_E2E_PORT" \
  "$PG_DATABASE"

export DATABASE_URL="postgresql://$(id -un)@127.0.0.1:$PG_E2E_PORT/$PG_DATABASE"

npm --prefix "$WEB_DIR" run db:migrate
npm --prefix "$WEB_DIR" run db:seed
npm --prefix "$WEB_DIR" run test:e2e:db:browser

echo "Database-backed web E2E verification completed."
