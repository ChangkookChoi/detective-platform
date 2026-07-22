#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WEB_DIR="$ROOT_DIR/apps/web"
PG_TEST_PORT="${PG_TEST_PORT:-55432}"
PG_TEST_ROOT=""
PG_BIN=""

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
  if [[ -n "$PG_TEST_ROOT" && -f "$PG_TEST_ROOT/data/postmaster.pid" ]]; then
    "$PG_BIN/pg_ctl" -D "$PG_TEST_ROOT/data" -m fast -w stop >/dev/null
  fi

  case "$PG_TEST_ROOT" in
    */detective-platform-pg.*)
      rm -r -- "$PG_TEST_ROOT"
      ;;
    "")
      ;;
    *)
      echo "Refusing to remove unexpected temporary path: $PG_TEST_ROOT" >&2
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

if "$PG_BIN/pg_isready" -h 127.0.0.1 -p "$PG_TEST_PORT" >/dev/null 2>&1; then
  echo "Port $PG_TEST_PORT is already serving PostgreSQL. Set PG_TEST_PORT to another port." >&2
  exit 1
fi

PG_TEST_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/detective-platform-pg.XXXXXX")"
trap cleanup EXIT INT TERM

"$PG_BIN/initdb" \
  -D "$PG_TEST_ROOT/data" \
  --encoding=UTF8 \
  --locale=C \
  --auth=trust \
  --no-instructions >/dev/null

"$PG_BIN/pg_ctl" \
  -D "$PG_TEST_ROOT/data" \
  -l "$PG_TEST_ROOT/postgres.log" \
  -o "-h 127.0.0.1 -k $PG_TEST_ROOT -p $PG_TEST_PORT" \
  -w start >/dev/null

"$PG_BIN/createdb" \
  -h 127.0.0.1 \
  -p "$PG_TEST_PORT" \
  detective_platform_test

export DATABASE_URL="postgresql://$(id -un)@127.0.0.1:$PG_TEST_PORT/detective_platform_test"

npm --prefix "$WEB_DIR" run db:migrate
npm --prefix "$WEB_DIR" run db:seed
npm --prefix "$WEB_DIR" run db:seed
npm --prefix "$WEB_DIR" run db:verify
npm --prefix "$WEB_DIR" run db:verify-publication
npm --prefix "$WEB_DIR" run db:verify-analytics
uv --directory "$ROOT_DIR/services/collector" run python -m unittest tests.integration_collector

echo "Local PostgreSQL integration verification completed."
