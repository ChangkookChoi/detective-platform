#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WEB_DIR="$ROOT_DIR/apps/web"
PG_DEV_ROOT="$ROOT_DIR/data/private/postgres-dev"
PG_DATA_DIR="$PG_DEV_ROOT/data"
PG_SOCKET_DIR="$PG_DEV_ROOT/socket"
PG_LOG_FILE="$PG_DEV_ROOT/postgres.log"
PG_PORT_FILE="$PG_DEV_ROOT/port"
REQUESTED_PG_DEV_PORT="${PG_DEV_PORT:-}"
PG_DEV_PORT=""
PG_DATABASE="detective_platform_dev"
PG_COLLECTOR_ROLE="detective_platform_collector"
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

validate_postgres() {
  find_postgres

  local version_number
  version_number="$("$PG_BIN/pg_config" --version | sed -E 's/.* ([0-9]+).*/\1/')"
  if (( version_number < 17 )); then
    echo "PostgreSQL 17 or newer is required." >&2
    exit 1
  fi

  if [[ -f "$PG_PORT_FILE" ]]; then
    PG_DEV_PORT="$(<"$PG_PORT_FILE")"
    if [[ -n "$REQUESTED_PG_DEV_PORT" &&
      "$REQUESTED_PG_DEV_PORT" != "$PG_DEV_PORT" ]]; then
      echo "Persistent cluster already uses port $PG_DEV_PORT." >&2
      exit 1
    fi
  else
    PG_DEV_PORT="${REQUESTED_PG_DEV_PORT:-55433}"
  fi

  if [[ ! "$PG_DEV_PORT" =~ ^[0-9]+$ ]] ||
    (( PG_DEV_PORT < 1024 || PG_DEV_PORT > 65535 )); then
    echo "PG_DEV_PORT must be an integer from 1024 through 65535." >&2
    exit 1
  fi
}

is_running() {
  [[ -f "$PG_DATA_DIR/PG_VERSION" ]] &&
    "$PG_BIN/pg_ctl" -D "$PG_DATA_DIR" status >/dev/null 2>&1
}

initialize_cluster() {
  mkdir -p "$PG_DEV_ROOT" "$PG_SOCKET_DIR"

  if [[ -f "$PG_DATA_DIR/PG_VERSION" ]]; then
    if [[ ! -f "$PG_PORT_FILE" ]]; then
      printf '%s\n' "$PG_DEV_PORT" >"$PG_PORT_FILE"
    fi
    return
  fi

  if [[ -d "$PG_DATA_DIR" ]] &&
    find "$PG_DATA_DIR" -mindepth 1 -print -quit | read -r; then
    echo "Refusing to initialize non-empty directory: $PG_DATA_DIR" >&2
    exit 1
  fi

  "$PG_BIN/initdb" \
    -D "$PG_DATA_DIR" \
    --encoding=UTF8 \
    --locale=C \
    --auth=trust \
    --no-instructions >/dev/null
  printf '%s\n' "$PG_DEV_PORT" >"$PG_PORT_FILE"
}

start_cluster() {
  if [[ ! -f "$PG_DATA_DIR/PG_VERSION" ]]; then
    echo "Persistent cluster is not initialized. Run: ./scripts/local-postgres.sh setup" >&2
    exit 1
  fi

  mkdir -p "$PG_SOCKET_DIR"

  if is_running; then
    echo "Persistent PostgreSQL is already running on port $PG_DEV_PORT."
    return
  fi

  if "$PG_BIN/pg_isready" -h 127.0.0.1 -p "$PG_DEV_PORT" >/dev/null 2>&1; then
    echo "Port $PG_DEV_PORT is already serving another PostgreSQL instance." >&2
    exit 1
  fi

  "$PG_BIN/pg_ctl" \
    -D "$PG_DATA_DIR" \
    -l "$PG_LOG_FILE" \
    -o "-h 127.0.0.1 -k $PG_SOCKET_DIR -p $PG_DEV_PORT" \
    -w start >/dev/null
  echo "Persistent PostgreSQL started on port $PG_DEV_PORT."
}

ensure_database() {
  if ! "$PG_BIN/psql" \
    -h 127.0.0.1 \
    -p "$PG_DEV_PORT" \
    -d postgres \
    -Atqc "SELECT 1 FROM pg_database WHERE datname = '$PG_DATABASE'" |
    grep -qx 1; then
    "$PG_BIN/createdb" \
      -h 127.0.0.1 \
      -p "$PG_DEV_PORT" \
      "$PG_DATABASE"
  fi
}

setup_database() {
  initialize_cluster
  start_cluster
  ensure_database

  export DATABASE_URL="postgresql://$(id -un)@127.0.0.1:$PG_DEV_PORT/$PG_DATABASE"

  npm --prefix "$WEB_DIR" run db:migrate
  npm --prefix "$WEB_DIR" run db:seed
  "$PG_BIN/psql" \
    -h 127.0.0.1 \
    -p "$PG_DEV_PORT" \
    -d "$PG_DATABASE" \
    -f "$ROOT_DIR/infra/postgres/local-collector-role.sql" >/dev/null

  echo "Persistent development database is ready."
  echo "Database: $PG_DATABASE"
  echo "Collector role: $PG_COLLECTOR_ROLE"
  echo "Data directory is ignored by Git: data/private/postgres-dev"
}

stop_cluster() {
  if [[ ! -f "$PG_DATA_DIR/PG_VERSION" ]]; then
    echo "Persistent PostgreSQL has not been initialized."
    return
  fi

  if ! is_running; then
    echo "Persistent PostgreSQL is already stopped."
    return
  fi

  "$PG_BIN/pg_ctl" -D "$PG_DATA_DIR" -m fast -w stop >/dev/null
  echo "Persistent PostgreSQL stopped."
}

show_status() {
  if is_running; then
    echo "Persistent PostgreSQL is running on port $PG_DEV_PORT."
  elif [[ -f "$PG_DATA_DIR/PG_VERSION" ]]; then
    echo "Persistent PostgreSQL is initialized and stopped."
  else
    echo "Persistent PostgreSQL is not initialized."
  fi
}

usage() {
  echo "Usage: ./scripts/local-postgres.sh {setup|start|stop|status}" >&2
}

validate_postgres

case "${1:-status}" in
  setup)
    setup_database
    ;;
  start)
    start_cluster
    ;;
  stop)
    stop_cluster
    ;;
  status)
    show_status
    ;;
  *)
    usage
    exit 2
    ;;
esac
