from __future__ import annotations

import argparse
import json
import os
from pathlib import Path

import psycopg

from collector.config import ConfigError, load_source_policies
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
    return parser


def main() -> int:
    args = _parser().parse_args()
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
