#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEPLOYMENT_URL=""
AUTH_MODE="unconfigured"
SMOKE_ROOT=""

usage() {
  cat <<'EOF'
Usage: ./scripts/verify-vercel-production-smoke.sh \
  --deployment=https://example.vercel.app \
  [--auth-mode=unconfigured|configured]

Checks a Vercel deployment through `vercel curl` without disabling deployment
protection. The unconfigured mode expects auth-only routes to fail closed.
EOF
}

cleanup() {
  case "$SMOKE_ROOT" in
    */detective-platform-production-smoke.*)
      rm -r -- "$SMOKE_ROOT"
      ;;
    "")
      ;;
    *)
      echo "Refusing to remove unexpected temporary path: $SMOKE_ROOT" >&2
      exit 1
      ;;
  esac
}

for argument in "$@"; do
  case "$argument" in
    --deployment=*)
      DEPLOYMENT_URL="${argument#*=}"
      ;;
    --auth-mode=*)
      AUTH_MODE="${argument#*=}"
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $argument" >&2
      usage >&2
      exit 1
      ;;
  esac
done

if ! [[ "$DEPLOYMENT_URL" =~ ^https://[A-Za-z0-9-]+([.][A-Za-z0-9-]+)*[.]vercel[.]app/?$ ]]; then
  echo "--deployment must be an HTTPS *.vercel.app URL." >&2
  exit 1
fi

if [[ "$AUTH_MODE" != "unconfigured" && "$AUTH_MODE" != "configured" ]]; then
  echo "--auth-mode must be unconfigured or configured." >&2
  exit 1
fi

if ! command -v npx >/dev/null 2>&1; then
  echo "npx is required." >&2
  exit 1
fi

SMOKE_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/detective-platform-production-smoke.XXXXXX")"
trap cleanup EXIT INT TERM

request() {
  local name="$1"
  local path="$2"
  local expected_status_pattern="$3"
  local body_file="$SMOKE_ROOT/${name}.body"
  local headers_file="$SMOKE_ROOT/${name}.headers"
  local status

  status="$(
    cd "$ROOT_DIR/apps/web"
    npx vercel curl "$path" \
        --deployment "$DEPLOYMENT_URL" \
        -- \
        -sS \
        -D "$headers_file" \
        -o "$body_file" \
        -w '%{http_code}'
  )"

  if ! [[ "$status" =~ $expected_status_pattern ]]; then
    echo "$name returned HTTP $status; expected $expected_status_pattern." >&2
    exit 1
  fi

  echo "$name: HTTP $status"
}

request home / '^200$'
grep -Eqi '<html|<!doctype html' "$SMOKE_ROOT/home.body" || {
  echo "Home response is not HTML." >&2
  exit 1
}

request offices /offices '^200$'
grep -Eqi '<html|<!doctype html' "$SMOKE_ROOT/offices.body" || {
  echo "Office list response is not HTML." >&2
  exit 1
}

request robots /robots.txt '^200$'
grep -Eqi '^User-Agent:[[:space:]]*\*' "$SMOKE_ROOT/robots.body" || {
  echo "robots.txt does not contain the default user-agent rule." >&2
  exit 1
}

request sitemap /sitemap.xml '^200$'
grep -Eq '<urlset([[:space:]>])' "$SMOKE_ROOT/sitemap.body" || {
  echo "sitemap.xml does not contain a urlset." >&2
  exit 1
}

if [[ "$AUTH_MODE" == "unconfigured" ]]; then
  request admin /admin/reviews '^503$'
  request sign_in /sign-in '^503$'

  for headers_file in "$SMOKE_ROOT/admin.headers" "$SMOKE_ROOT/sign_in.headers"; do
    grep -Eqi '^retry-after:[[:space:]]*3600' "$headers_file" || {
      echo "Fail-closed response is missing Retry-After: 3600." >&2
      exit 1
    }
    grep -Eqi '^x-robots-tag:[[:space:]]*noindex,[[:space:]]*nofollow' "$headers_file" || {
      echo "Fail-closed response is missing X-Robots-Tag: noindex, nofollow." >&2
      exit 1
    }
  done
else
  request admin /admin/reviews '^(302|303|307|308)$'
  request sign_in /sign-in '^200$'
fi

echo "Vercel Production smoke verification completed ($AUTH_MODE auth mode)."
