#!/usr/bin/env bash

set -euo pipefail

DATABASE_BACKUP_URL="${DATABASE_BACKUP_URL:-}"
BACKUP_ENCRYPTION_RECIPIENT="${BACKUP_ENCRYPTION_RECIPIENT:-}"
BACKUP_OUTPUT_DIR="${BACKUP_OUTPUT_DIR:-}"
BACKUP_BASENAME="${BACKUP_BASENAME:-detective-platform-$(date -u +%Y%m%dT%H%M%SZ)}"
BACKUP_MAX_BYTES="${BACKUP_MAX_BYTES:-15728640}"
BACKUP_ALLOW_INSECURE_LOCAL="${BACKUP_ALLOW_INSECURE_LOCAL:-false}"
POSTGRES_CLIENT_MODE="${POSTGRES_CLIENT_MODE:-auto}"
POSTGRES_CLIENT_IMAGE="${POSTGRES_CLIENT_IMAGE:-postgres:17-alpine}"
POSTGRES_DOCKER_NETWORK="${POSTGRES_DOCKER_NETWORK:-}"
BACKUP_TEMP_ROOT=""

fail() {
  echo "$1" >&2
  exit 1
}

cleanup() {
  case "$BACKUP_TEMP_ROOT" in
    */detective-platform-encrypted-backup.*)
      rm -r -- "$BACKUP_TEMP_ROOT"
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

validate_configuration() {
  [[ -n "$DATABASE_BACKUP_URL" ]] || fail "DATABASE_BACKUP_URL is required."
  [[ -n "$BACKUP_ENCRYPTION_RECIPIENT" ]] ||
    fail "BACKUP_ENCRYPTION_RECIPIENT is required."
  [[ -n "$BACKUP_OUTPUT_DIR" ]] || fail "BACKUP_OUTPUT_DIR is required."

  case "$DATABASE_BACKUP_URL" in
    postgresql://* | postgres://*)
      ;;
    *)
      fail "DATABASE_BACKUP_URL must be a PostgreSQL URL."
      ;;
  esac

  if [[ "$BACKUP_ALLOW_INSECURE_LOCAL" != "true" ]]; then
    if [[ "$DATABASE_BACKUP_URL" != *"sslmode=require"* &&
      "$DATABASE_BACKUP_URL" != *"sslmode=verify-ca"* &&
      "$DATABASE_BACKUP_URL" != *"sslmode=verify-full"* ]]; then
      fail "DATABASE_BACKUP_URL must require TLS."
    fi

    if [[ "$DATABASE_BACKUP_URL" == *"@localhost"* ||
      "$DATABASE_BACKUP_URL" == *"@127.0.0.1"* ||
      "$DATABASE_BACKUP_URL" == *"@[::1]"* ]]; then
      fail "A local database requires BACKUP_ALLOW_INSECURE_LOCAL=true."
    fi
  fi

  [[ "$BACKUP_BASENAME" =~ ^[a-zA-Z0-9][a-zA-Z0-9._-]{0,119}$ ]] ||
    fail "BACKUP_BASENAME contains unsupported characters."
  [[ "$BACKUP_MAX_BYTES" =~ ^[0-9]+$ ]] ||
    fail "BACKUP_MAX_BYTES must be a positive integer."
  (( BACKUP_MAX_BYTES > 0 )) || fail "BACKUP_MAX_BYTES must be greater than zero."

  case "$POSTGRES_CLIENT_MODE" in
    auto | local | docker)
      ;;
    *)
      fail "POSTGRES_CLIENT_MODE must be auto, local, or docker."
      ;;
  esac
}

local_postgres_major() {
  pg_dump --version 2>/dev/null | sed -E 's/.* ([0-9]+)(\.[0-9]+)?.*/\1/'
}

select_postgres_client_mode() {
  if [[ "$POSTGRES_CLIENT_MODE" != "auto" ]]; then
    echo "$POSTGRES_CLIENT_MODE"
    return
  fi

  if command -v pg_dump >/dev/null 2>&1 &&
    command -v pg_restore >/dev/null 2>&1 &&
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
    --env DATABASE_BACKUP_URL
    --volume "$BACKUP_TEMP_ROOT:/backup"
  )

  if [[ -n "$POSTGRES_DOCKER_NETWORK" ]]; then
    docker_args+=(--network "$POSTGRES_DOCKER_NETWORK")
  fi

  docker "${docker_args[@]}" "$POSTGRES_CLIENT_IMAGE" "$@"
}

create_dump() {
  local mode="$1"
  local dump_file="$2"

  if [[ "$mode" == "local" ]]; then
    require_command pg_dump
    require_command pg_restore

    if [[ ! "$(local_postgres_major)" =~ ^[0-9]+$ ]] ||
      (( $(local_postgres_major) < 17 )); then
      fail "PostgreSQL 17 or newer client tools are required."
    fi

    pg_dump \
      --dbname="$DATABASE_BACKUP_URL" \
      --format=custom \
      --no-owner \
      --no-privileges \
      --file="$dump_file"
    pg_restore --list "$dump_file" >/dev/null
    return
  fi

  require_command docker
  run_docker sh -eu -c '
    pg_dump \
      --dbname="$DATABASE_BACKUP_URL" \
      --format=custom \
      --no-owner \
      --no-privileges \
      --file=/backup/database.dump
    pg_restore --list /backup/database.dump >/dev/null
  '
}

write_sha256() {
  local output_dir="$1"
  local archive_name="$2"
  local manifest_name="$3"

  if command -v sha256sum >/dev/null 2>&1; then
    (
      cd "$output_dir"
      sha256sum "$archive_name" >"$manifest_name"
    )
    return
  fi

  require_command shasum
  (
    cd "$output_dir"
    shasum -a 256 "$archive_name" >"$manifest_name"
  )
}

validate_configuration
require_command age

umask 077
mkdir -p -- "$BACKUP_OUTPUT_DIR"
BACKUP_TEMP_ROOT="$(
  mktemp -d "${TMPDIR:-/tmp}/detective-platform-encrypted-backup.XXXXXX"
)"
trap cleanup EXIT INT TERM

client_mode="$(select_postgres_client_mode)"
dump_file="$BACKUP_TEMP_ROOT/database.dump"
archive_name="$BACKUP_BASENAME.dump.age"
manifest_name="$archive_name.sha256"
metadata_name="$archive_name.json"
archive_file="$BACKUP_OUTPUT_DIR/$archive_name"
manifest_file="$BACKUP_OUTPUT_DIR/$manifest_name"
metadata_file="$BACKUP_OUTPUT_DIR/$metadata_name"

[[ ! -e "$archive_file" && ! -e "$manifest_file" && ! -e "$metadata_file" ]] ||
  fail "Backup output already exists."

create_dump "$client_mode" "$dump_file"

dump_bytes="$(wc -c <"$dump_file" | tr -d '[:space:]')"
[[ "$dump_bytes" =~ ^[0-9]+$ ]] || fail "Could not determine backup size."
(( dump_bytes > 0 )) || fail "PostgreSQL backup is empty."
(( dump_bytes <= BACKUP_MAX_BYTES )) ||
  fail "PostgreSQL backup exceeds BACKUP_MAX_BYTES."

age \
  --encrypt \
  --recipient "$BACKUP_ENCRYPTION_RECIPIENT" \
  --output "$archive_file" \
  "$dump_file"

archive_bytes="$(wc -c <"$archive_file" | tr -d '[:space:]')"
[[ "$archive_bytes" =~ ^[0-9]+$ ]] || fail "Could not determine archive size."
(( archive_bytes > 0 )) || fail "Encrypted backup archive is empty."

write_sha256 "$BACKUP_OUTPUT_DIR" "$archive_name" "$manifest_name"

created_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
cat >"$metadata_file" <<EOF
{
  "archive": "$archive_name",
  "archiveBytes": $archive_bytes,
  "createdAt": "$created_at",
  "encryption": "age-x25519",
  "format": "postgresql-custom"
}
EOF

if [[ -n "${GITHUB_OUTPUT:-}" ]]; then
  {
    printf 'archive_name=%s\n' "$archive_name"
    printf 'manifest_name=%s\n' "$manifest_name"
    printf 'metadata_name=%s\n' "$metadata_name"
    printf 'archive_bytes=%s\n' "$archive_bytes"
  } >>"$GITHUB_OUTPUT"
fi

echo "Encrypted PostgreSQL backup created: $archive_name ($archive_bytes bytes)."
