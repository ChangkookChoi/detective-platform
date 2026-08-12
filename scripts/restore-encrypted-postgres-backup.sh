#!/usr/bin/env bash

set -euo pipefail

BACKUP_ARCHIVE="${BACKUP_ARCHIVE:-}"
BACKUP_SHA256_FILE="${BACKUP_SHA256_FILE:-}"
BACKUP_DECRYPTION_IDENTITY_FILE="${BACKUP_DECRYPTION_IDENTITY_FILE:-}"
RESTORE_DATABASE_URL="${RESTORE_DATABASE_URL:-}"
RESTORE_REMOTE_CONFIRMATION="${RESTORE_REMOTE_CONFIRMATION:-}"
POSTGRES_CLIENT_MODE="${POSTGRES_CLIENT_MODE:-auto}"
POSTGRES_CLIENT_IMAGE="${POSTGRES_CLIENT_IMAGE:-postgres:17-alpine@sha256:742f40ea20b9ff2ff31db5458d127452988a2164df9e17441e191f3b72252193}"
POSTGRES_DOCKER_NETWORK="${POSTGRES_DOCKER_NETWORK:-}"
RESTORE_TEMP_ROOT=""

fail() {
  echo "$1" >&2
  exit 1
}

cleanup() {
  case "$RESTORE_TEMP_ROOT" in
    */detective-platform-encrypted-restore.*)
      rm -r -- "$RESTORE_TEMP_ROOT"
      ;;
    "")
      ;;
    *)
      echo "Refusing to remove unexpected temporary path." >&2
      exit 1
      ;;
  esac
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "$1 is required."
}

local_postgres_major() {
  pg_restore --version 2>/dev/null | sed -E 's/.* ([0-9]+)(\.[0-9]+)?.*/\1/'
}

select_postgres_client_mode() {
  if [[ "$POSTGRES_CLIENT_MODE" != "auto" ]]; then
    echo "$POSTGRES_CLIENT_MODE"
    return
  fi

  if command -v pg_restore >/dev/null 2>&1 &&
    command -v psql >/dev/null 2>&1 &&
    [[ "$(local_postgres_major)" =~ ^[0-9]+$ ]] &&
    (( $(local_postgres_major) >= 17 )); then
    echo "local"
    return
  fi

  if command -v docker >/dev/null 2>&1; then
    echo "docker"
    return
  fi

  fail "PostgreSQL 17 clients or Docker are required."
}

run_docker() {
  local user_id group_id
  user_id="$(id -u)"
  group_id="$(id -g)"

  local docker_args=(
    run
    --rm
    --user "$user_id:$group_id"
    --env RESTORE_DATABASE_URL
    --volume "$RESTORE_TEMP_ROOT:/restore"
  )

  if [[ -n "$POSTGRES_DOCKER_NETWORK" ]]; then
    docker_args+=(--network "$POSTGRES_DOCKER_NETWORK")
  fi

  docker "${docker_args[@]}" "$POSTGRES_CLIENT_IMAGE" "$@"
}

verify_checksum() {
  local archive_dir archive_name manifest_name
  archive_dir="$(cd "$(dirname "$BACKUP_ARCHIVE")" && pwd)"
  archive_name="$(basename "$BACKUP_ARCHIVE")"
  manifest_name="$(basename "$BACKUP_SHA256_FILE")"

  [[ "$(cd "$(dirname "$BACKUP_SHA256_FILE")" && pwd)" == "$archive_dir" ]] ||
    fail "Backup archive and checksum must be in the same directory."

  if command -v sha256sum >/dev/null 2>&1; then
    (
      cd "$archive_dir"
      sha256sum --check --strict "$manifest_name"
    ) >/dev/null
  else
    require_command shasum
    (
      cd "$archive_dir"
      shasum -a 256 --check "$manifest_name"
    ) >/dev/null
  fi

  grep -Fq " $archive_name" "$BACKUP_SHA256_FILE" ||
    fail "Checksum manifest does not reference the selected archive."
}

assert_empty_and_restore() {
  local mode="$1"
  local dump_file="$2"
  local table_count

  if [[ "$mode" == "local" ]]; then
    require_command pg_restore
    require_command psql

    if [[ ! "$(local_postgres_major)" =~ ^[0-9]+$ ]] ||
      (( $(local_postgres_major) < 17 )); then
      fail "PostgreSQL 17 or newer client tools are required."
    fi

    pg_restore --list "$dump_file" >/dev/null
    table_count="$(
      psql "$RESTORE_DATABASE_URL" -Atqc \
        "select count(*) from pg_tables where schemaname not in ('pg_catalog', 'information_schema')"
    )"
    [[ "$table_count" == "0" ]] || fail "Restore target database is not empty."

    pg_restore \
      --dbname="$RESTORE_DATABASE_URL" \
      --exit-on-error \
      --no-owner \
      --no-privileges \
      "$dump_file"
    return
  fi

  require_command docker
  table_count="$(
    run_docker sh -eu -c '
      pg_restore --list /restore/database.dump >/dev/null
      psql "$RESTORE_DATABASE_URL" -Atqc \
        "select count(*) from pg_tables where schemaname not in ('"'"'pg_catalog'"'"', '"'"'information_schema'"'"')"
    '
  )"
  [[ "$table_count" == "0" ]] || fail "Restore target database is not empty."

  run_docker pg_restore \
    --dbname="$RESTORE_DATABASE_URL" \
    --exit-on-error \
    --no-owner \
    --no-privileges \
    /restore/database.dump
}

[[ -f "$BACKUP_ARCHIVE" ]] || fail "BACKUP_ARCHIVE must reference a file."
[[ -f "$BACKUP_SHA256_FILE" ]] ||
  fail "BACKUP_SHA256_FILE must reference a file."
[[ -f "$BACKUP_DECRYPTION_IDENTITY_FILE" ]] ||
  fail "BACKUP_DECRYPTION_IDENTITY_FILE must reference a file."
[[ -n "$RESTORE_DATABASE_URL" ]] || fail "RESTORE_DATABASE_URL is required."

case "$RESTORE_DATABASE_URL" in
  postgresql://* | postgres://*)
    ;;
  *)
    fail "RESTORE_DATABASE_URL must be a PostgreSQL URL."
    ;;
esac

if [[ "$RESTORE_DATABASE_URL" != *"@localhost"* &&
  "$RESTORE_DATABASE_URL" != *"@127.0.0.1"* &&
  "$RESTORE_DATABASE_URL" != *"@[::1]"* &&
  "$RESTORE_REMOTE_CONFIRMATION" != "isolated-database-only" ]]; then
  fail "Remote restore requires RESTORE_REMOTE_CONFIRMATION=isolated-database-only."
fi

case "$POSTGRES_CLIENT_MODE" in
  auto | local | docker)
    ;;
  *)
    fail "POSTGRES_CLIENT_MODE must be auto, local, or docker."
    ;;
esac

require_command age
verify_checksum

umask 077
RESTORE_TEMP_ROOT="$(
  mktemp -d "${TMPDIR:-/tmp}/detective-platform-encrypted-restore.XXXXXX"
)"
trap cleanup EXIT INT TERM

dump_file="$RESTORE_TEMP_ROOT/database.dump"
age \
  --decrypt \
  --identity "$BACKUP_DECRYPTION_IDENTITY_FILE" \
  --output "$dump_file" \
  "$BACKUP_ARCHIVE"

[[ -s "$dump_file" ]] || fail "Decrypted PostgreSQL backup is empty."

started_at="$(date +%s)"
client_mode="$(select_postgres_client_mode)"
assert_empty_and_restore "$client_mode" "$dump_file"
finished_at="$(date +%s)"
elapsed_seconds="$((finished_at - started_at))"

echo "Encrypted PostgreSQL backup restored to an empty isolated database in ${elapsed_seconds}s."
