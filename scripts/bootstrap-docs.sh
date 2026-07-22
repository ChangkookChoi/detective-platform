#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

mkdir -p \
  apps/web \
  services/collector \
  docs/product \
  docs/architecture \
  docs/operations \
  docs/decisions \
  docs/archive \
  infra \
  scripts \
  .github/ISSUE_TEMPLATE \
  .github/workflows

required_files=(
  "AGENTS.md"
  "README.md"
  "docs/STATUS.md"
  "docs/product/MVP_SCOPE.md"
  "docs/product/PRD.md"
  "docs/product/USER_FLOWS.md"
  "docs/architecture/ARCHITECTURE.md"
  "docs/architecture/DATA_MODEL.md"
  "docs/architecture/API_CONVENTIONS.md"
)

missing_files=()

for file in "${required_files[@]}"; do
  if [[ ! -s "$file" ]]; then
    missing_files+=("$file")
  fi
done

if (( ${#missing_files[@]} > 0 )); then
  echo "Missing or empty project documents:" >&2
  printf '  - %s\n' "${missing_files[@]}" >&2
  exit 1
fi

echo "Project document structure is ready."
