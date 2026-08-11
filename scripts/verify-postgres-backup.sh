#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WEB_DIR="$ROOT_DIR/apps/web"
PG_BACKUP_TEST_PORT="${PG_BACKUP_TEST_PORT:-55434}"
PG_BACKUP_TEST_ROOT=""
PG_BIN=""
SOURCE_DATABASE="detective_platform_backup_source"
RESTORED_DATABASE="detective_platform_backup_restored"
BACKUP_MARKER_OFFICE_ID="00000000-0000-4000-8000-000000000091"
BACKUP_MARKER_RUN_ID="00000000-0000-4000-8000-000000000092"
BACKUP_MARKER_RECORD_ID="00000000-0000-4000-8000-000000000093"
BACKUP_MARKER_REVIEW_ID="00000000-0000-4000-8000-000000000094"
BACKUP_MARKER_ACTION_ID="00000000-0000-4000-8000-000000000095"

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
  if [[ -n "$PG_BACKUP_TEST_ROOT" &&
    -f "$PG_BACKUP_TEST_ROOT/data/postmaster.pid" ]]; then
    "$PG_BIN/pg_ctl" \
      -D "$PG_BACKUP_TEST_ROOT/data" \
      -m fast \
      -w stop >/dev/null
  fi

  case "$PG_BACKUP_TEST_ROOT" in
    */detective-platform-backup.*)
      rm -r -- "$PG_BACKUP_TEST_ROOT"
      ;;
    "")
      ;;
    *)
      echo "Refusing to remove unexpected temporary path: $PG_BACKUP_TEST_ROOT" >&2
      exit 1
      ;;
  esac
}

database_fingerprint() {
  local database_name="$1"

  "$PG_BIN/psql" \
    -h 127.0.0.1 \
    -p "$PG_BACKUP_TEST_PORT" \
    -d "$database_name" \
    -Atqc "
      select 'collection_runs=' || count(*) from collection_runs
      union all
      select 'collected_records=' || count(*) from collected_records
      union all
      select 'migrations=' || count(*) from drizzle.__drizzle_migrations
      union all
      select 'offices=' || count(*) from offices
      union all
      select 'regions=' || count(*) from regions
      union all
      select 'review_actions=' || count(*) from review_actions
      union all
      select 'review_items=' || count(*) from review_items
      union all
      select 'service_categories=' || count(*) from service_categories
      order by 1"
}

find_postgres

version_number="$("$PG_BIN/pg_config" --version | sed -E 's/.* ([0-9]+).*/\1/')"
if (( version_number < 17 )); then
  echo "PostgreSQL 17 or newer is required." >&2
  exit 1
fi

if ! [[ "$PG_BACKUP_TEST_PORT" =~ ^[0-9]+$ ]] ||
  (( PG_BACKUP_TEST_PORT < 1024 || PG_BACKUP_TEST_PORT > 65535 )); then
  echo "PG_BACKUP_TEST_PORT must be an integer from 1024 through 65535." >&2
  exit 1
fi

if "$PG_BIN/pg_isready" \
  -h 127.0.0.1 \
  -p "$PG_BACKUP_TEST_PORT" >/dev/null 2>&1; then
  echo "Port $PG_BACKUP_TEST_PORT is already serving PostgreSQL." >&2
  echo "Set PG_BACKUP_TEST_PORT to another port." >&2
  exit 1
fi

PG_BACKUP_TEST_ROOT="$(
  mktemp -d "${TMPDIR:-/tmp}/detective-platform-backup.XXXXXX"
)"
trap cleanup EXIT INT TERM

"$PG_BIN/initdb" \
  -D "$PG_BACKUP_TEST_ROOT/data" \
  --encoding=UTF8 \
  --locale=C \
  --auth=trust \
  --no-instructions >/dev/null

"$PG_BIN/pg_ctl" \
  -D "$PG_BACKUP_TEST_ROOT/data" \
  -l "$PG_BACKUP_TEST_ROOT/postgres.log" \
  -o "-h 127.0.0.1 -k $PG_BACKUP_TEST_ROOT -p $PG_BACKUP_TEST_PORT" \
  -w start >/dev/null

"$PG_BIN/createdb" \
  -h 127.0.0.1 \
  -p "$PG_BACKUP_TEST_PORT" \
  "$SOURCE_DATABASE"

export DATABASE_URL="postgresql://$(id -un)@127.0.0.1:$PG_BACKUP_TEST_PORT/$SOURCE_DATABASE"

npm --prefix "$WEB_DIR" run db:migrate
npm --prefix "$WEB_DIR" run db:seed

"$PG_BIN/psql" \
  -h 127.0.0.1 \
  -p "$PG_BACKUP_TEST_PORT" \
  -d "$SOURCE_DATABASE" \
  -v ON_ERROR_STOP=1 \
  -v office_id="$BACKUP_MARKER_OFFICE_ID" \
  -v run_id="$BACKUP_MARKER_RUN_ID" \
  -v record_id="$BACKUP_MARKER_RECORD_ID" \
  -v review_id="$BACKUP_MARKER_REVIEW_ID" \
  -v action_id="$BACKUP_MARKER_ACTION_ID" <<'SQL' >/dev/null
insert into offices (id, slug, name, region_id, status)
select :'office_id', 'backup-restore-marker', '합성 백업 복구 표본', id, 'draft'
from regions
where type = 'district'
order by slug
limit 1;

insert into collection_runs (
  id,
  source_name,
  adapter_name,
  extractor_version,
  status,
  finished_at,
  discovered_count,
  collected_count,
  failed_count
) values (
  :'run_id',
  'backup-restore-verifier',
  'synthetic',
  'backup-v1',
  'succeeded',
  now(),
  1,
  1,
  0
);

insert into collected_records (
  id,
  collection_run_id,
  source_url,
  source_record_key,
  extracted_values,
  normalized_values,
  content_hash
) values (
  :'record_id',
  :'run_id',
  'https://backup-restore.example.invalid/office',
  'backup-restore-marker',
  '{"name":"합성 백업 복구 표본"}',
  '{"name":"합성 백업 복구 표본"}',
  'backup-restore-marker'
);

insert into review_items (
  id,
  collected_record_id,
  type,
  risk,
  status,
  proposed_values,
  cause
) values (
  :'review_id',
  :'record_id',
  'new_office',
  'high',
  'on_hold',
  '{"name":"합성 백업 복구 표본"}',
  'backup_restore_verification'
);

insert into review_actions (
  id,
  review_item_id,
  actor_id,
  decision,
  reason
) values (
  :'action_id',
  :'review_id',
  'backup_restore_verifier',
  'on_hold',
  'synthetic backup restore verification'
);
SQL

source_fingerprint="$(database_fingerprint "$SOURCE_DATABASE")"
backup_output_dir="$PG_BACKUP_TEST_ROOT/encrypted-backup"
backup_identity_file="$PG_BACKUP_TEST_ROOT/backup-identity.txt"
backup_basename="detective-platform-backup-self-test"

if ! command -v age >/dev/null 2>&1 ||
  ! command -v age-keygen >/dev/null 2>&1; then
  echo "age and age-keygen are required for encrypted backup verification." >&2
  exit 1
fi

age-keygen -o "$backup_identity_file" >/dev/null 2>&1
backup_recipient="$(age-keygen -y "$backup_identity_file")"

DATABASE_BACKUP_URL="$DATABASE_URL" \
BACKUP_ENCRYPTION_RECIPIENT="$backup_recipient" \
BACKUP_OUTPUT_DIR="$backup_output_dir" \
BACKUP_BASENAME="$backup_basename" \
BACKUP_ALLOW_INSECURE_LOCAL=true \
POSTGRES_CLIENT_MODE=local \
  "$ROOT_DIR/scripts/create-encrypted-postgres-backup.sh"

backup_file="$backup_output_dir/$backup_basename.dump.age"
backup_sha256_file="$backup_file.sha256"

"$PG_BIN/createdb" \
  -h 127.0.0.1 \
  -p "$PG_BACKUP_TEST_PORT" \
  "$RESTORED_DATABASE"

RESTORE_DATABASE_URL="postgresql://$(id -un)@127.0.0.1:$PG_BACKUP_TEST_PORT/$RESTORED_DATABASE" \
BACKUP_ARCHIVE="$backup_file" \
BACKUP_SHA256_FILE="$backup_sha256_file" \
BACKUP_DECRYPTION_IDENTITY_FILE="$backup_identity_file" \
POSTGRES_CLIENT_MODE=local \
  "$ROOT_DIR/scripts/restore-encrypted-postgres-backup.sh"

restored_fingerprint="$(database_fingerprint "$RESTORED_DATABASE")"
if [[ "$source_fingerprint" != "$restored_fingerprint" ]]; then
  echo "Source and restored database fingerprints differ." >&2
  exit 1
fi

marker_relationship_count="$(
  "$PG_BIN/psql" \
    -h 127.0.0.1 \
    -p "$PG_BACKUP_TEST_PORT" \
    -d "$RESTORED_DATABASE" \
    -Atqc "
      select count(*)
      from review_actions action
      join review_items review on review.id = action.review_item_id
      join collected_records record on record.id = review.collected_record_id
      join collection_runs run on run.id = record.collection_run_id
      where action.id = '$BACKUP_MARKER_ACTION_ID'
        and review.id = '$BACKUP_MARKER_REVIEW_ID'
        and record.id = '$BACKUP_MARKER_RECORD_ID'
        and run.id = '$BACKUP_MARKER_RUN_ID'"
)"

if [[ "$marker_relationship_count" != "1" ]]; then
  echo "Restored review audit relationship is incomplete." >&2
  exit 1
fi

export DATABASE_URL="postgresql://$(id -un)@127.0.0.1:$PG_BACKUP_TEST_PORT/$RESTORED_DATABASE"
npm --prefix "$WEB_DIR" run db:verify

echo "PostgreSQL logical backup and restore verification completed."
