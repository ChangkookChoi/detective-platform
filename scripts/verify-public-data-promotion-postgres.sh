#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WEB_DIR="$ROOT_DIR/apps/web"
PG_PROMOTION_TEST_PORT="${PG_PROMOTION_TEST_PORT:-55436}"
PG_PROMOTION_TEST_ROOT=""
PG_BIN=""
SOURCE_DATABASE="detective_platform_promotion_source"
TARGET_DATABASE="detective_platform_promotion_target"
BOOTSTRAP_DATABASE="detective_platform_promotion_bootstrap"

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
  if [[ -n "$PG_PROMOTION_TEST_ROOT" &&
    -f "$PG_PROMOTION_TEST_ROOT/data/postmaster.pid" ]]; then
    "$PG_BIN/pg_ctl" \
      -D "$PG_PROMOTION_TEST_ROOT/data" \
      -m fast \
      -w stop >/dev/null
  fi

  case "$PG_PROMOTION_TEST_ROOT" in
    */detective-platform-promotion.*)
      rm -r -- "$PG_PROMOTION_TEST_ROOT"
      ;;
    "")
      ;;
    *)
      echo "Refusing to remove unexpected temporary path: $PG_PROMOTION_TEST_ROOT" >&2
      exit 1
      ;;
  esac
}

find_postgres

version_number="$("$PG_BIN/pg_config" --version | sed -E 's/.* ([0-9]+).*/\1/')"
if (( version_number < 17 )); then
  echo "PostgreSQL 17 or newer is required." >&2
  exit 1
fi

if ! [[ "$PG_PROMOTION_TEST_PORT" =~ ^[0-9]+$ ]] ||
  (( PG_PROMOTION_TEST_PORT < 1024 || PG_PROMOTION_TEST_PORT > 65535 )); then
  echo "PG_PROMOTION_TEST_PORT must be an integer from 1024 through 65535." >&2
  exit 1
fi

if "$PG_BIN/pg_isready" \
  -h 127.0.0.1 \
  -p "$PG_PROMOTION_TEST_PORT" >/dev/null 2>&1; then
  echo "Port $PG_PROMOTION_TEST_PORT is already serving PostgreSQL." >&2
  echo "Set PG_PROMOTION_TEST_PORT to another port." >&2
  exit 1
fi

PG_PROMOTION_TEST_ROOT="$(
  mktemp -d "${TMPDIR:-/tmp}/detective-platform-promotion.XXXXXX"
)"
trap cleanup EXIT INT TERM

"$PG_BIN/initdb" \
  -D "$PG_PROMOTION_TEST_ROOT/data" \
  --encoding=UTF8 \
  --locale=C \
  --auth=trust \
  --no-instructions >/dev/null

"$PG_BIN/pg_ctl" \
  -D "$PG_PROMOTION_TEST_ROOT/data" \
  -l "$PG_PROMOTION_TEST_ROOT/postgres.log" \
  -o "-h 127.0.0.1 -k $PG_PROMOTION_TEST_ROOT -p $PG_PROMOTION_TEST_PORT" \
  -w start >/dev/null

for database_name in "$SOURCE_DATABASE" "$TARGET_DATABASE"; do
  "$PG_BIN/createdb" \
    -h 127.0.0.1 \
    -p "$PG_PROMOTION_TEST_PORT" \
    "$database_name"

  DATABASE_URL="postgresql://$(id -un)@127.0.0.1:$PG_PROMOTION_TEST_PORT/$database_name" \
    npm --prefix "$WEB_DIR" run db:migrate
  DATABASE_URL="postgresql://$(id -un)@127.0.0.1:$PG_PROMOTION_TEST_PORT/$database_name" \
    npm --prefix "$WEB_DIR" run db:seed
done

SOURCE_DATABASE_URL="postgresql://$(id -un)@127.0.0.1:$PG_PROMOTION_TEST_PORT/$SOURCE_DATABASE" \
TARGET_DATABASE_URL="postgresql://$(id -un)@127.0.0.1:$PG_PROMOTION_TEST_PORT/$TARGET_DATABASE" \
  npm --prefix "$WEB_DIR" run db:verify-public-data-promotion

SOURCE_DATABASE_URL="postgresql://$(id -un)@127.0.0.1:$PG_PROMOTION_TEST_PORT/$SOURCE_DATABASE" \
TARGET_DATABASE_URL="postgresql://$(id -un)@127.0.0.1:$PG_PROMOTION_TEST_PORT/$TARGET_DATABASE" \
PROMOTE_PUBLIC_DATA_CONFIRM="PROMOTE_NEW_PUBLISHED_DATA_TO_EXISTING_TARGET" \
PROMOTE_PUBLIC_DATA_DRY_RUN=1 \
PROMOTE_PUBLIC_DATA_EXPECT_TARGET_OFFICES=2 \
PROMOTE_PUBLIC_DATA_EXPECT_NEW_OFFICES=1 \
ALLOW_LOCAL_PROMOTION_TARGET=1 \
  npm --prefix "$WEB_DIR" run db:promote-public-data

SOURCE_DATABASE_URL="postgresql://$(id -un)@127.0.0.1:$PG_PROMOTION_TEST_PORT/$SOURCE_DATABASE" \
TARGET_DATABASE_URL="postgresql://$(id -un)@127.0.0.1:$PG_PROMOTION_TEST_PORT/$TARGET_DATABASE" \
PROMOTE_PUBLIC_DATA_CONFIRM="PROMOTE_NEW_PUBLISHED_DATA_TO_EXISTING_TARGET" \
PROMOTE_PUBLIC_DATA_EXPECT_TARGET_OFFICES=2 \
PROMOTE_PUBLIC_DATA_EXPECT_NEW_OFFICES=1 \
ALLOW_LOCAL_PROMOTION_TARGET=1 \
  npm --prefix "$WEB_DIR" run db:promote-public-data

SOURCE_DATABASE_URL="postgresql://$(id -un)@127.0.0.1:$PG_PROMOTION_TEST_PORT/$SOURCE_DATABASE" \
TARGET_DATABASE_URL="postgresql://$(id -un)@127.0.0.1:$PG_PROMOTION_TEST_PORT/$TARGET_DATABASE" \
PROMOTE_PUBLIC_DATA_CONFIRM="PROMOTE_NEW_PUBLISHED_DATA_TO_EXISTING_TARGET" \
PROMOTE_PUBLIC_DATA_EXPECT_TARGET_OFFICES=3 \
PROMOTE_PUBLIC_DATA_EXPECT_NEW_OFFICES=0 \
ALLOW_LOCAL_PROMOTION_TARGET=1 \
  npm --prefix "$WEB_DIR" run db:promote-public-data

promotion_counts="$(
  "$PG_BIN/psql" \
    -h 127.0.0.1 \
    -p "$PG_PROMOTION_TEST_PORT" \
    -d "$TARGET_DATABASE" \
    -Atqc "
      select
        (select count(*) from offices where status = 'published') || ':' ||
        (select count(*) from review_items where id = '86000000-0000-4000-8000-000000000001')
    "
)"
if [[ "$promotion_counts" != "3:1" ]]; then
  echo "Promotion CLI did not preserve the expected public/private counts." >&2
  exit 1
fi

"$PG_BIN/createdb" \
  -h 127.0.0.1 \
  -p "$PG_PROMOTION_TEST_PORT" \
  "$BOOTSTRAP_DATABASE"

DATABASE_URL="postgresql://$(id -un)@127.0.0.1:$PG_PROMOTION_TEST_PORT/$BOOTSTRAP_DATABASE" \
  npm --prefix "$WEB_DIR" run db:migrate
DATABASE_URL="postgresql://$(id -un)@127.0.0.1:$PG_PROMOTION_TEST_PORT/$BOOTSTRAP_DATABASE" \
  npm --prefix "$WEB_DIR" run db:seed

SOURCE_DATABASE_URL="postgresql://$(id -un)@127.0.0.1:$PG_PROMOTION_TEST_PORT/$SOURCE_DATABASE" \
TARGET_DATABASE_URL="postgresql://$(id -un)@127.0.0.1:$PG_PROMOTION_TEST_PORT/$BOOTSTRAP_DATABASE" \
BOOTSTRAP_PUBLIC_DATA_CONFIRM="IMPORT_PUBLISHED_DATA_TO_EMPTY_TARGET" \
ALLOW_LOCAL_BOOTSTRAP_TARGET=1 \
  npm --prefix "$WEB_DIR" run db:bootstrap-public-data

bootstrap_count="$(
  "$PG_BIN/psql" \
    -h 127.0.0.1 \
    -p "$PG_PROMOTION_TEST_PORT" \
    -d "$BOOTSTRAP_DATABASE" \
    -Atqc "select count(*) from offices where status = 'published'"
)"
if [[ "$bootstrap_count" != "3" ]]; then
  echo "Empty-target bootstrap regression verification failed." >&2
  exit 1
fi

echo "Public data promotion PostgreSQL integration verification completed."
