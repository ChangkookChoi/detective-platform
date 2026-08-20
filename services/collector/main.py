from __future__ import annotations

import argparse
import json
import os
from pathlib import Path

import psycopg

from collector.config import ConfigError, load_source_policies
from collector.candidate_batch import (
    CandidateBatchError,
    load_active_leaf_region_queries,
    load_database_duplicate_keys,
    load_candidate_batch,
    load_source_registry,
    run_candidate_preflight,
)
from collector.naver_api_hub import NaverApiHubClient, NaverApiHubError
from collector.office_discovery import (
    OfficeDiscoveryError,
    build_discovery_review_queue,
    build_query_plan,
    extract_official_source_facts,
    probe_web_source_candidates,
    purge_expired_discovery_files,
    refilter_naver_local_discovery,
    run_naver_local_discovery,
    run_naver_web_source_discovery,
)
from collector.pipeline import CollectorPipeline
from collector.repository import CollectorRepository


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="승인된 출처 정책에 따라 업체 정보 후보를 수집합니다."
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    validate = subparsers.add_parser("validate-config")
    validate.add_argument("--config", type=Path, required=True)

    run = subparsers.add_parser("run")
    run.add_argument("--config", type=Path, required=True)
    run.add_argument("--source", required=True)

    preflight = subparsers.add_parser("preflight-batch")
    preflight.add_argument("--manifest", type=Path, required=True)
    preflight.add_argument("--registry", type=Path, required=True)
    preflight.add_argument("--output", type=Path, required=True)
    preflight.add_argument("--user-agent", required=True)
    preflight.add_argument("--max-workers", type=int, default=4)

    discover = subparsers.add_parser("discover-naver-local")
    discover.add_argument("--output-dir", type=Path, required=True)
    discover.add_argument("--registry", type=Path, required=True)
    discover.add_argument("--region", action="append")
    discover.add_argument("--regions-from-database", action="store_true")
    discover.add_argument("--keyword", action="append", required=True)
    discover.add_argument("--display", type=int, default=5)
    discover.add_argument("--max-requests", type=int, default=30)
    discover.add_argument("--retention-days", type=int, default=7)

    refilter = subparsers.add_parser("filter-naver-discovery")
    refilter.add_argument("--raw", type=Path, required=True)
    refilter.add_argument("--output", type=Path, required=True)
    refilter.add_argument("--registry", type=Path, required=True)

    purge = subparsers.add_parser("purge-naver-discovery")
    purge.add_argument("--output-dir", type=Path, required=True)

    discover_web = subparsers.add_parser("discover-naver-web-sources")
    discover_web.add_argument("--local-raw", type=Path, required=True)
    discover_web.add_argument("--output-dir", type=Path, required=True)
    discover_web.add_argument("--registry", type=Path, required=True)
    discover_web.add_argument("--display", type=int, default=5)
    discover_web.add_argument("--max-candidates", type=int, default=20)
    discover_web.add_argument("--max-requests", type=int, default=30)
    discover_web.add_argument("--retention-days", type=int, default=7)

    probe_sources = subparsers.add_parser("probe-discovery-sources")
    probe_sources.add_argument("--web-raw", type=Path, required=True)
    probe_sources.add_argument("--web-filtered", type=Path, required=True)
    probe_sources.add_argument("--output", type=Path, required=True)
    probe_sources.add_argument("--user-agent", required=True)
    probe_sources.add_argument("--max-sources", type=int, default=10)

    extract_facts = subparsers.add_parser("extract-discovery-facts")
    extract_facts.add_argument("--local-raw", type=Path, required=True)
    extract_facts.add_argument("--web-raw", type=Path, required=True)
    extract_facts.add_argument("--web-filtered", type=Path, required=True)
    extract_facts.add_argument("--probe", type=Path, required=True)
    extract_facts.add_argument("--output", type=Path, required=True)
    extract_facts.add_argument("--user-agent", required=True)
    extract_facts.add_argument("--max-sources", type=int, default=10)

    build_review = subparsers.add_parser("build-discovery-review-queue")
    build_review.add_argument("--output-dir", type=Path, required=True)
    build_review.add_argument("--output", type=Path, required=True)
    return parser


def _validate_private_output_dir(output_dir: Path) -> Path:
    repository_root = Path(__file__).resolve().parents[2]
    private_root = (repository_root / "data" / "private").resolve()
    resolved = output_dir.resolve()
    if not resolved.is_relative_to(private_root):
        raise OfficeDiscoveryError("discovery_output_must_be_under_data_private")
    return resolved


def _validate_private_path(path: Path) -> Path:
    resolved = path.resolve()
    _validate_private_output_dir(resolved.parent)
    return resolved


def main() -> int:
    args = _parser().parse_args()

    if args.command == "build-discovery-review-queue":
        try:
            output_dir = _validate_private_output_dir(args.output_dir)
            summary = build_discovery_review_queue(
                output_dir=output_dir,
                output_path=_validate_private_path(args.output),
            )
        except (OfficeDiscoveryError, OSError) as exc:
            print(
                json.dumps(
                    {"ok": False, "error": str(exc)},
                    ensure_ascii=False,
                    sort_keys=True,
                )
            )
            return 2
        print(
            json.dumps(
                {"ok": True, **summary.__dict__},
                ensure_ascii=False,
                sort_keys=True,
            )
        )
        return 0

    if args.command == "purge-naver-discovery":
        try:
            output_dir = _validate_private_output_dir(args.output_dir)
            summary = purge_expired_discovery_files(output_dir)
        except (OfficeDiscoveryError, OSError) as exc:
            print(
                json.dumps(
                    {"ok": False, "error": str(exc)},
                    ensure_ascii=False,
                    sort_keys=True,
                )
            )
            return 2
        print(
            json.dumps(
                {"ok": True, **summary.__dict__},
                ensure_ascii=False,
                sort_keys=True,
            )
        )
        return 0

    if args.command == "filter-naver-discovery":
        database_url = os.environ.get("DATABASE_URL")
        try:
            raw_path = _validate_private_path(args.raw)
            output_path = _validate_private_path(args.output)
            registry = load_source_registry(args.registry)
            duplicate_keys = (
                load_database_duplicate_keys(database_url)
                if database_url
                else {
                    key: set()
                    for key in ("source", "name", "phone", "address", "slug")
                }
            )
            summary = refilter_naver_local_discovery(
                raw_path=raw_path,
                filtered_path=output_path,
                duplicate_keys=duplicate_keys,
                registry=registry,
            )
        except (
            CandidateBatchError,
            OfficeDiscoveryError,
            OSError,
            psycopg.Error,
        ) as exc:
            print(
                json.dumps(
                    {"ok": False, "error": str(exc)},
                    ensure_ascii=False,
                    sort_keys=True,
                )
            )
            return 2
        print(
            json.dumps(
                {"ok": True, **summary.__dict__},
                ensure_ascii=False,
                sort_keys=True,
            )
        )
        return 0

    if args.command == "discover-naver-web-sources":
        client_id = os.environ.get("NAVER_API_HUB_CLIENT_ID", "")
        client_secret = os.environ.get("NAVER_API_HUB_CLIENT_SECRET", "")
        database_url = os.environ.get("DATABASE_URL")
        try:
            if args.max_candidates > args.max_requests:
                raise OfficeDiscoveryError(
                    "discovery_web_candidates_exceed_request_budget"
                )
            local_raw_path = _validate_private_path(args.local_raw)
            output_dir = _validate_private_output_dir(args.output_dir)
            registry = load_source_registry(args.registry)
            duplicate_keys = (
                load_database_duplicate_keys(database_url)
                if database_url
                else {
                    key: set()
                    for key in ("source", "name", "phone", "address", "slug")
                }
            )
            with NaverApiHubClient(
                client_id,
                client_secret,
                max_requests=args.max_requests,
            ) as client:
                summary = run_naver_web_source_discovery(
                    client,
                    local_raw_path=local_raw_path,
                    output_dir=output_dir,
                    duplicate_keys=duplicate_keys,
                    registry=registry,
                    max_candidates=args.max_candidates,
                    display=args.display,
                    retention_days=args.retention_days,
                )
        except (
            CandidateBatchError,
            NaverApiHubError,
            OfficeDiscoveryError,
            OSError,
            psycopg.Error,
        ) as exc:
            print(
                json.dumps(
                    {"ok": False, "error": str(exc)},
                    ensure_ascii=False,
                    sort_keys=True,
                )
            )
            return 2
        print(
            json.dumps(
                {"ok": True, **summary.__dict__},
                ensure_ascii=False,
                sort_keys=True,
            )
        )
        return 0

    if args.command == "probe-discovery-sources":
        try:
            summary = probe_web_source_candidates(
                raw_path=_validate_private_path(args.web_raw),
                filtered_path=_validate_private_path(args.web_filtered),
                output_path=_validate_private_path(args.output),
                user_agent=args.user_agent,
                max_sources=args.max_sources,
            )
        except (OfficeDiscoveryError, OSError) as exc:
            print(
                json.dumps(
                    {"ok": False, "error": str(exc)},
                    ensure_ascii=False,
                    sort_keys=True,
                )
            )
            return 2
        print(
            json.dumps(
                {"ok": True, **summary.__dict__},
                ensure_ascii=False,
                sort_keys=True,
            )
        )
        return 0

    if args.command == "extract-discovery-facts":
        try:
            summary = extract_official_source_facts(
                local_raw_path=_validate_private_path(args.local_raw),
                web_raw_path=_validate_private_path(args.web_raw),
                web_filtered_path=_validate_private_path(args.web_filtered),
                probe_path=_validate_private_path(args.probe),
                output_path=_validate_private_path(args.output),
                user_agent=args.user_agent,
                max_sources=args.max_sources,
            )
        except (OfficeDiscoveryError, OSError) as exc:
            print(
                json.dumps(
                    {"ok": False, "error": str(exc)},
                    ensure_ascii=False,
                    sort_keys=True,
                )
            )
            return 2
        print(
            json.dumps(
                {"ok": True, **summary.__dict__},
                ensure_ascii=False,
                sort_keys=True,
            )
        )
        return 0

    if args.command == "discover-naver-local":
        client_id = os.environ.get("NAVER_API_HUB_CLIENT_ID", "")
        client_secret = os.environ.get("NAVER_API_HUB_CLIENT_SECRET", "")
        database_url = os.environ.get("DATABASE_URL")
        try:
            output_dir = _validate_private_output_dir(args.output_dir)
            regions = list(args.region or [])
            if args.regions_from_database:
                if not database_url:
                    raise OfficeDiscoveryError(
                        "discovery_database_url_required_for_regions"
                    )
                regions.extend(load_active_leaf_region_queries(database_url))
            queries = build_query_plan(
                regions,
                args.keyword,
                max_queries=args.max_requests,
            )
            registry = load_source_registry(args.registry)
            duplicate_keys = (
                load_database_duplicate_keys(database_url)
                if database_url
                else {
                    key: set()
                    for key in ("source", "name", "phone", "address", "slug")
                }
            )
            with NaverApiHubClient(
                client_id,
                client_secret,
                max_requests=args.max_requests,
            ) as client:
                summary = run_naver_local_discovery(
                    client,
                    queries=queries,
                    output_dir=output_dir,
                    duplicate_keys=duplicate_keys,
                    registry=registry,
                    display=args.display,
                    retention_days=args.retention_days,
                )
        except (
            CandidateBatchError,
            NaverApiHubError,
            OfficeDiscoveryError,
            OSError,
            psycopg.Error,
        ) as exc:
            print(
                json.dumps(
                    {"ok": False, "error": str(exc)},
                    ensure_ascii=False,
                    sort_keys=True,
                )
            )
            return 2
        print(
            json.dumps(
                {
                    "ok": True,
                    **summary.__dict__,
                },
                ensure_ascii=False,
                sort_keys=True,
            )
        )
        return 0

    if args.command == "preflight-batch":
        try:
            batch = load_candidate_batch(args.manifest)
            registry = load_source_registry(args.registry)
            report = run_candidate_preflight(
                batch,
                registry,
                user_agent=args.user_agent,
                database_url=os.environ.get("DATABASE_URL"),
                max_workers=args.max_workers,
            )
            args.output.parent.mkdir(parents=True, exist_ok=True)
            args.output.write_text(
                json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True)
                + "\n",
                encoding="utf-8",
            )
        except (CandidateBatchError, json.JSONDecodeError, OSError) as exc:
            print(json.dumps({"ok": False, "error": str(exc)}, ensure_ascii=False))
            return 2
        print(
            json.dumps(
                {
                    "ok": report["ok"],
                    "batchId": report["batchId"],
                    "candidateCount": report["candidateCount"],
                    "eligibleCount": report["eligibleCount"],
                    "output": str(args.output),
                },
                ensure_ascii=False,
                sort_keys=True,
            )
        )
        return 0 if report["ok"] else 1

    try:
        policies = load_source_policies(args.config)
    except (ConfigError, OSError) as exc:
        print(json.dumps({"ok": False, "error": str(exc)}, ensure_ascii=False))
        return 2

    if args.command == "validate-config":
        print(
            json.dumps(
                {"ok": True, "sources": sorted(policies)},
                ensure_ascii=False,
            )
        )
        return 0

    policy = policies.get(args.source)
    if policy is None:
        print(json.dumps({"ok": False, "error": "source_not_found"}))
        return 2

    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        print(json.dumps({"ok": False, "error": "database_url_missing"}))
        return 2

    try:
        with CollectorRepository(database_url) as repository:
            summary = CollectorPipeline(policy, repository).run()
    except psycopg.Error:
        print(json.dumps({"ok": False, "error": "database_operation_failed"}))
        return 1
    except Exception:
        print(json.dumps({"ok": False, "error": "collector_unexpected_failure"}))
        return 1
    print(
        json.dumps(
            {
                "ok": summary.status != "failed",
                "runId": summary.run_id,
                "source": summary.source_name,
                "status": summary.status,
                "discoveredCount": summary.discovered_count,
                "collectedCount": summary.collected_count,
                "unchangedCount": summary.unchanged_count,
                "reviewCount": summary.review_count,
                "failedCount": summary.failed_count,
                "errorCodes": summary.error_codes,
            },
            ensure_ascii=False,
            sort_keys=True,
        )
    )
    return 0 if summary.status != "failed" else 1


if __name__ == "__main__":
    raise SystemExit(main())
