#!/usr/bin/env bash

set -euo pipefail

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
invocation_dir="$PWD"
collector_dir="$repository_root/services/collector"
environment_file="$repository_root/apps/web/.env.local"
registry_file="$repository_root/docs/operations/SOURCE_REGISTRY.md"
output_dir="${1:-$repository_root/data/private/discovery-cycle}"
region_raw_dir="${2:-$repository_root/data/private/nationwide-discovery-runs}"
region_limit="${DISCOVERY_REGION_LIMIT:-100}"
web_candidate_limit="${DISCOVERY_WEB_CANDIDATES:-100}"
keyword="${DISCOVERY_KEYWORD:-탐정사무소}"
user_agent="DetectivePlatformPreflight/1.0 (+https://github.com/ChangkookChoi/detective-platform)"

if [[ "$output_dir" != /* ]]; then
  output_dir="$invocation_dir/${output_dir#./}"
fi
if [[ "$region_raw_dir" != /* ]]; then
  region_raw_dir="$invocation_dir/${region_raw_dir#./}"
fi

mkdir -p "$output_dir"

run_collector() {
  uv --directory "$collector_dir" run \
    --env-file "$environment_file" \
    python main.py "$@"
}

local_result="$(run_collector discover-naver-local \
  --output-dir "$output_dir" \
  --registry "$registry_file" \
  --regions-from-raw-dir "$region_raw_dir" \
  --region-limit "$region_limit" \
  --keyword "$keyword" \
  --display 5 \
  --max-requests "$region_limit" \
  --retention-days 7 \
  --nationwide)"
printf '%s\n' "$local_result"
local_raw="$(jq -r '.raw_output' <<<"$local_result")"
direct_count="$(jq -r '.source_check_required_count' <<<"$local_result")"
review_count="$(jq -r '.needs_review_count' <<<"$local_result")"
facts_count=0

if (( direct_count > 0 )); then
  direct_result="$(run_collector prepare-local-source-links \
    --local-raw "$local_raw" \
    --output-dir "$output_dir" \
    --registry "$registry_file" \
    --nationwide)"
  printf '%s\n' "$direct_result"
  direct_raw="$(jq -r '.raw_output' <<<"$direct_result")"
  direct_filtered="$(jq -r '.filtered_output' <<<"$direct_result")"
  direct_probe="${direct_raw%.raw.jsonl}.probe.jsonl"
  direct_fact="${direct_raw%.raw.jsonl}.facts.jsonl"
  direct_probe_result="$(run_collector probe-discovery-sources \
    --web-raw "$direct_raw" \
    --web-filtered "$direct_filtered" \
    --output "$direct_probe" \
    --user-agent "$user_agent" \
    --max-sources "$(( direct_count < 50 ? direct_count : 50 ))")"
  printf '%s\n' "$direct_probe_result"
  direct_content_count="$(jq -r '.content_check_required_count' <<<"$direct_probe_result")"
  if (( direct_content_count > 0 )); then
    direct_fact_result="$(run_collector extract-discovery-facts \
      --local-raw "$local_raw" \
      --web-raw "$direct_raw" \
      --web-filtered "$direct_filtered" \
      --probe "$direct_probe" \
      --output "$direct_fact" \
      --user-agent "$user_agent" \
      --max-sources "$direct_content_count")"
    printf '%s\n' "$direct_fact_result"
    facts_count=$((facts_count + direct_content_count))
  fi
fi

if (( review_count > 0 )); then
  web_limit="$web_candidate_limit"
  if (( web_limit > review_count )); then
    web_limit="$review_count"
  fi
  web_result_file="$(mktemp)"
  if run_collector discover-naver-web-sources \
    --local-raw "$local_raw" \
    --output-dir "$output_dir" \
    --registry "$registry_file" \
    --max-candidates "$web_limit" \
    --max-requests "$web_limit" \
    --display 5 \
    --retention-days 7 \
    --nationwide >"$web_result_file"; then
    web_result="$(<"$web_result_file")"
    printf '%s\n' "$web_result"
    web_source_count="$(jq -r '.source_check_required_count' <<<"$web_result")"
    if (( web_source_count > 0 )); then
      web_raw="$(jq -r '.raw_output' <<<"$web_result")"
      web_filtered="$(jq -r '.filtered_output' <<<"$web_result")"
      web_probe="${web_raw%.raw.jsonl}.probe.jsonl"
      web_fact="${web_raw%.raw.jsonl}.facts.jsonl"
      web_probe_result="$(run_collector probe-discovery-sources \
        --web-raw "$web_raw" \
        --web-filtered "$web_filtered" \
        --output "$web_probe" \
        --user-agent "$user_agent" \
        --max-sources "$(( web_source_count < 50 ? web_source_count : 50 ))")"
      printf '%s\n' "$web_probe_result"
      web_content_count="$(jq -r '.content_check_required_count' <<<"$web_probe_result")"
      if (( web_content_count > 0 )); then
        web_fact_result="$(run_collector extract-discovery-facts \
          --local-raw "$local_raw" \
          --web-raw "$web_raw" \
          --web-filtered "$web_filtered" \
          --probe "$web_probe" \
          --output "$web_fact" \
          --user-agent "$user_agent" \
          --max-sources "$web_content_count")"
        printf '%s\n' "$web_fact_result"
        facts_count=$((facts_count + web_content_count))
      fi
    fi
  else
    web_error="$(<"$web_result_file")"
    if [[ "$(jq -r '.error // empty' <<<"$web_error")" != "discovery_web_candidates_empty" ]]; then
      printf '%s\n' "$web_error" >&2
      rm -f "$web_result_file"
      exit 2
    fi
    printf '%s\n' "$web_error"
  fi
  rm -f "$web_result_file"
fi

if (( facts_count > 0 )); then
  timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
  review_output="$output_dir/review-queue-$timestamp.jsonl"
  review_result="$(run_collector build-discovery-review-queue \
    --output-dir "$output_dir" \
    --output "$review_output")"
  printf '%s\n' "$review_result"
  research_count="$(jq -r '.research_count' <<<"$review_result")"
  if (( research_count > 0 )); then
    research_output="$(jq -r '.research_output' <<<"$review_result")"
    research_plan="${research_output%.research.jsonl}.research-plan.jsonl"
    plan_result="$(run_collector plan-discovery-research \
      --input "$research_output" \
      --output "$research_plan")"
    printf '%s\n' "$plan_result"
    enrichment_count="$(jq -r '.same_domain_enrichment_count' <<<"$plan_result")"
    if (( enrichment_count > 0 )); then
      enrichment_output="${research_output%.research.jsonl}.research-enrichment.jsonl"
      enrichment_result="$(run_collector enrich-discovery-research \
        --input "$research_output" \
        --output "$enrichment_output" \
        --user-agent "$user_agent" \
        --max-candidates "$(( enrichment_count < 50 ? enrichment_count : 50 ))" \
        --max-pages 3)"
      printf '%s\n' "$enrichment_result"
    fi
  fi
fi
