from __future__ import annotations

import argparse
import json
import os
from pathlib import Path

import psycopg

from collector.config import ConfigError, load_source_policies
from collector.candidate_batch import (
    CandidateBatchError,
    load_candidate_batch,
    load_source_registry,
    run_candidate_preflight,
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
    return parser


def main() -> int:
    args = _parser().parse_args()

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
