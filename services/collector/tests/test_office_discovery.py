from __future__ import annotations

import json
import stat
import tempfile
import unittest
from dataclasses import asdict
from datetime import datetime, timezone
from pathlib import Path

from collector.candidate_batch import NetworkCheck, RegistryEntry
from collector.naver_api_hub import NaverSearchResponse
from collector.office_discovery import (
    _html_fallback_facts,
    OfficialSourceFactRecord,
    OfficeDiscoveryError,
    RawOfficeDiscoveryRecord,
    assess_business_relevance,
    build_discovery_review_queue,
    build_query_plan,
    extract_official_source_facts,
    filter_discovery_record,
    load_raw_discovery_records,
    normalize_result_text,
    probe_web_source_candidates,
    purge_expired_discovery_files,
    refilter_naver_local_discovery,
    run_naver_local_discovery,
    run_naver_web_source_discovery,
)


def _raw(**overrides: str) -> RawOfficeDiscoveryRecord:
    values = {
        "version": 1,
        "record_id": "record-1",
        "run_id": "run-1",
        "provider": "naver_api_hub",
        "endpoint": "local",
        "query": "강남구 탐정사무소",
        "position": 1,
        "fetched_at": "2026-08-20T00:00:00+00:00",
        "expires_at": "2026-08-27T00:00:00+00:00",
        "title": "<b>테스트 탐정사무소</b>",
        "link": "https://example.com/",
        "category": "서비스>탐정",
        "address": "서울특별시 강남구 테스트동 1",
        "road_address": "서울특별시 강남구 테스트로 1",
    }
    values.update(overrides)
    return RawOfficeDiscoveryRecord(**values)  # type: ignore[arg-type]


def _empty_duplicate_keys() -> dict[str, set[str]]:
    return {
        key: set() for key in ("source", "name", "phone", "address", "slug")
    }


class FakeNaverClient:
    def __init__(
        self,
        items: tuple[dict[str, str], ...],
        *,
        web_items: tuple[dict[str, str], ...] = (),
    ) -> None:
        self.items = items
        self.web_items = web_items
        self.request_count = 0

    def search_local(
        self, query: str, *, display: int = 5
    ) -> NaverSearchResponse:
        self.request_count += 1
        return NaverSearchResponse(
            endpoint="local",
            query=query,
            total=len(self.items),
            start=1,
            display=min(display, len(self.items)),
            items=self.items[:display],
        )

    def search_web(
        self, query: str, *, display: int = 10, start: int = 1
    ) -> NaverSearchResponse:
        self.request_count += 1
        return NaverSearchResponse(
            endpoint="webkr",
            query=query,
            total=len(self.web_items),
            start=start,
            display=min(display, len(self.web_items)),
            items=self.web_items[:display],
        )


class OfficeDiscoveryTests(unittest.TestCase):
    def test_extracts_minimal_visible_html_fact_signals(self) -> None:
        facts = _html_fallback_facts(
            """
            <html><body>
              <h1>테스트 탐정사무소</h1>
              <p>서울특별시 강남구 테스트로 1</p>
              <p>탐정 업무 상담과 사실 조사를 제공합니다.</p>
              <a href="tel:02-1234-5678">전화</a>
            </body></html>
            """.encode("utf-8"),
            candidate_name="테스트 탐정사무소",
            candidate_address="서울특별시 강남구 테스트로 1",
        )

        self.assertTrue(facts["nameMatch"])
        self.assertTrue(facts["addressMatch"])
        self.assertTrue(facts["regionMatch"])
        self.assertEqual(facts["phoneNormalized"], "0212345678")
        self.assertTrue(facts["businessServiceMatch"])

    def test_does_not_treat_detective_entertainment_as_service_evidence(self) -> None:
        facts = _html_fallback_facts(
            """
            <html><body>
              <h1>명탐정 코난 추리게임 팝업</h1>
              <p>서울특별시 강남구 테스트로 1</p>
              <a href="tel:02-1234-5678">행사 문의</a>
            </body></html>
            """.encode("utf-8"),
            candidate_name="명탐정 코난 추리게임 팝업",
            candidate_address="서울특별시 강남구 테스트로 1",
        )

        self.assertFalse(facts["businessServiceMatch"])

    def test_classifies_business_relevance_without_substring_false_positives(self) -> None:
        for name, category in (
            ("동물보육원 군포지부", "반려동물서비스"),
            ("레미콘", "건축자재"),
            ("명탐정 코난 추리게임 팝업", "전시,행사"),
            ("더폴 행정사 사무소", "행정사"),
        ):
            with self.subTest(name=name):
                self.assertEqual(
                    assess_business_relevance(name, category).status,
                    "irrelevant",
                )

        self.assertEqual(
            assess_business_relevance(
                "코난탐정사무소", "탐정,민간조사"
            ).status,
            "probable",
        )
        self.assertEqual(
            assess_business_relevance("PIS", "탐정,민간조사").status,
            "probable",
        )
        self.assertEqual(
            assess_business_relevance("정의 탐정", "생활서비스").status,
            "ambiguous",
        )

    def test_builds_deduplicated_bounded_query_plan(self) -> None:
        plan = build_query_plan(
            ["서울 강남구", "서울  강남구"],
            ["탐정사무소", "흥신소"],
            max_queries=2,
        )
        self.assertEqual(
            [query.text for query in plan],
            ["서울 강남구 탐정사무소", "서울 강남구 흥신소"],
        )
        with self.assertRaisesRegex(
            OfficeDiscoveryError, "discovery_query_budget_exceeded"
        ):
            build_query_plan(["강남구", "송파구"], ["탐정", "흥신소"], max_queries=3)

    def test_normalizes_search_markup(self) -> None:
        self.assertEqual(
            normalize_result_text("<b>테스트</b>&nbsp;탐정"), "테스트 탐정"
        )

    def test_marks_candidate_as_requiring_independent_source_check(self) -> None:
        result = filter_discovery_record(
            _raw(),
            duplicate_keys=_empty_duplicate_keys(),
            registry={},
            seen_identities=set(),
        )
        self.assertEqual(result.status, "source_check_required")
        self.assertEqual(result.reason_codes, ())
        self.assertEqual(result.source_verification, "required")
        self.assertFalse(result.promotion_allowed)

    def test_rejects_out_of_region_and_unrelated_result(self) -> None:
        result = filter_discovery_record(
            _raw(
                title="일반 심부름센터",
                category="생활서비스",
                road_address="인천광역시 남동구 테스트로 1",
            ),
            duplicate_keys=_empty_duplicate_keys(),
            registry={},
            seen_identities=set(),
        )
        self.assertEqual(result.status, "rejected")
        self.assertIn("OUTSIDE_TARGET_REGION", result.reason_codes)
        self.assertIn("UNRELATED_CATEGORY", result.reason_codes)

    def test_rejects_result_without_detective_business_signal(self) -> None:
        result = filter_discovery_record(
            _raw(title="테스트 서비스", category="생활서비스"),
            duplicate_keys=_empty_duplicate_keys(),
            registry={},
            seen_identities=set(),
        )
        self.assertEqual(result.status, "rejected")
        self.assertIn("IRRELEVANT_BUSINESS", result.reason_codes)

    def test_requires_review_when_official_link_is_missing(self) -> None:
        result = filter_discovery_record(
            _raw(link=""),
            duplicate_keys=_empty_duplicate_keys(),
            registry={},
            seen_identities=set(),
        )
        self.assertEqual(result.status, "needs_review")
        self.assertEqual(result.reason_codes, ("OFFICIAL_SOURCE_REQUIRED",))

    def test_rejects_existing_address_and_registry_host(self) -> None:
        duplicate_keys = _empty_duplicate_keys()
        duplicate_keys["address"].add("서울특별시강남구테스트로1")
        registry = {
            "example.com": RegistryEntry(
                key="example.com", host="example.com", status="manual_approved"
            )
        }
        result = filter_discovery_record(
            _raw(),
            duplicate_keys=duplicate_keys,
            registry=registry,
            seen_identities=set(),
        )
        self.assertEqual(result.status, "rejected")
        self.assertIn("EXISTING_ADDRESS", result.reason_codes)
        self.assertIn("SOURCE_REGISTRY_MATCH", result.reason_codes)

    def test_writes_separate_raw_and_filtered_jsonl_with_expiry(self) -> None:
        items = (
            {
                "title": "테스트 탐정사무소",
                "link": "https://example.com/",
                "category": "서비스>탐정",
                "description": "",
                "telephone": "",
                "address": "서울특별시 강남구 테스트동 1",
                "roadAddress": "서울특별시 강남구 테스트로 1",
                "mapx": "127.0",
                "mapy": "37.0",
            },
        )
        client = FakeNaverClient(items)
        with tempfile.TemporaryDirectory() as directory:
            expired_raw = Path(directory) / "naver-local-old.raw.jsonl"
            expired_filtered = Path(directory) / "naver-local-old.filtered.jsonl"
            expired_raw.write_text(
                json.dumps(
                    asdict(
                        _raw(
                            run_id="naver-local-old",
                            expires_at="2026-08-19T00:00:00+00:00",
                        )
                    ),
                    ensure_ascii=False,
                )
                + "\n",
                encoding="utf-8",
            )
            expired_filtered.write_text("{}\n", encoding="utf-8")
            summary = run_naver_local_discovery(
                client,  # type: ignore[arg-type]
                queries=build_query_plan(
                    ["서울 강남구"], ["탐정사무소"], max_queries=1
                ),
                output_dir=Path(directory),
                duplicate_keys=_empty_duplicate_keys(),
                registry={},
                retention_days=7,
                now=datetime(2026, 8, 20, tzinfo=timezone.utc),
            )
            raw_lines = Path(summary.raw_output).read_text(encoding="utf-8").splitlines()
            filtered_lines = Path(summary.filtered_output).read_text(
                encoding="utf-8"
            ).splitlines()
            raw_mode = stat.S_IMODE(Path(summary.raw_output).stat().st_mode)
            expired_files_exist = expired_raw.exists() or expired_filtered.exists()

        self.assertEqual(summary.raw_count, 1)
        self.assertEqual(summary.source_check_required_count, 1)
        self.assertEqual(summary.purged_run_count, 1)
        self.assertEqual(summary.purged_file_count, 2)
        self.assertFalse(expired_files_exist)
        self.assertEqual(len(raw_lines), 1)
        self.assertEqual(len(filtered_lines), 1)
        self.assertEqual(
            json.loads(raw_lines[0])["expires_at"], "2026-08-27T00:00:00+00:00"
        )
        self.assertEqual(
            json.loads(filtered_lines[0])["rules_version"], "office-discovery-v3"
        )
        self.assertFalse(json.loads(filtered_lines[0])["promotion_allowed"])
        self.assertEqual(raw_mode, 0o600)

    def test_loads_legacy_raw_record_but_drops_unused_fields(self) -> None:
        payload = {
            **asdict(_raw()),
            "description": "legacy description",
            "telephone": "02-000-0000",
            "mapx": "127.0",
            "mapy": "37.0",
        }
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "legacy.raw.jsonl"
            path.write_text(
                json.dumps(payload, ensure_ascii=False) + "\n", encoding="utf-8"
            )
            records = load_raw_discovery_records(
                path, now=datetime(2026, 8, 20, tzinfo=timezone.utc)
            )

        self.assertEqual(records, (_raw(),))
        self.assertNotIn("description", asdict(records[0]))

    def test_rejects_expired_raw_file_and_purges_only_expired_run(self) -> None:
        expired = _raw(
            run_id="naver-local-expired",
            expires_at="2026-08-19T00:00:00+00:00",
        )
        active = _raw(
            run_id="naver-local-active",
            record_id="record-2",
            expires_at="2026-08-27T00:00:00+00:00",
        )
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            expired_raw = root / "naver-local-expired.raw.jsonl"
            expired_filtered = root / "naver-local-expired.filtered.jsonl"
            active_raw = root / "naver-local-active.raw.jsonl"
            expired_raw.write_text(
                json.dumps(asdict(expired), ensure_ascii=False) + "\n",
                encoding="utf-8",
            )
            expired_filtered.write_text("{}\n", encoding="utf-8")
            active_raw.write_text(
                json.dumps(asdict(active), ensure_ascii=False) + "\n",
                encoding="utf-8",
            )

            with self.assertRaisesRegex(
                OfficeDiscoveryError, "discovery_raw_records_expired"
            ):
                load_raw_discovery_records(
                    expired_raw,
                    now=datetime(2026, 8, 20, tzinfo=timezone.utc),
                )
            summary = purge_expired_discovery_files(
                root, now=datetime(2026, 8, 20, tzinfo=timezone.utc)
            )

            self.assertFalse(expired_raw.exists())
            self.assertFalse(expired_filtered.exists())
            self.assertTrue(active_raw.exists())

        self.assertEqual(summary.scanned_run_count, 2)
        self.assertEqual(summary.deleted_run_count, 1)
        self.assertEqual(summary.deleted_file_count, 2)

    def test_refilter_never_promotes_search_result(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            raw_path = Path(directory) / "raw.jsonl"
            filtered_path = Path(directory) / "filtered.jsonl"
            raw_path.write_text(
                json.dumps(asdict(_raw()), ensure_ascii=False) + "\n",
                encoding="utf-8",
            )
            summary = refilter_naver_local_discovery(
                raw_path=raw_path,
                filtered_path=filtered_path,
                duplicate_keys=_empty_duplicate_keys(),
                registry={},
                now=datetime(2026, 8, 20, tzinfo=timezone.utc),
            )
            filtered = json.loads(filtered_path.read_text(encoding="utf-8"))

        self.assertEqual(summary.source_check_required_count, 1)
        self.assertEqual(filtered["source_verification"], "required")
        self.assertFalse(filtered["promotion_allowed"])

    def test_discovers_web_source_candidates_without_promoting_them(self) -> None:
        web_items = (
            {
                "title": "테스트 탐정사무소 공식 홈페이지",
                "link": "https://example.com/",
                "description": "not stored",
            },
            {
                "title": "관련 없는 디렉터리",
                "link": "https://blog.naver.com/example",
                "description": "not stored",
            },
            {
                "title": "테스트 탐정사무소",
                "link": "https://example.com/",
                "description": "not stored",
            },
        )
        client = FakeNaverClient((), web_items=web_items)
        local_record = _raw(link="")
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            local_path = root / "naver-local-input.raw.jsonl"
            local_path.write_text(
                json.dumps(asdict(local_record), ensure_ascii=False) + "\n",
                encoding="utf-8",
            )
            summary = run_naver_web_source_discovery(
                client,  # type: ignore[arg-type]
                local_raw_path=local_path,
                output_dir=root,
                duplicate_keys=_empty_duplicate_keys(),
                registry={},
                max_candidates=1,
                display=3,
                retention_days=7,
                now=datetime(2026, 8, 20, tzinfo=timezone.utc),
            )
            raw = [
                json.loads(line)
                for line in Path(summary.raw_output)
                .read_text(encoding="utf-8")
                .splitlines()
            ]
            filtered = [
                json.loads(line)
                for line in Path(summary.filtered_output)
                .read_text(encoding="utf-8")
                .splitlines()
            ]
            manifest = json.loads(
                Path(summary.manifest_output).read_text(encoding="utf-8")
            )
            probe_summary = probe_web_source_candidates(
                raw_path=Path(summary.raw_output),
                filtered_path=Path(summary.filtered_output),
                output_path=root / "naver-web-test.probe.jsonl",
                user_agent="DetectivePlatformPreflight/1.0",
                max_sources=3,
                now=datetime(2026, 8, 20, tzinfo=timezone.utc),
                checker=lambda *_args, **_kwargs: NetworkCheck(
                    status="eligible",
                    robots_status=200,
                    source_status=200,
                    final_url="https://example.com/",
                    content_bytes=123,
                    reason=None,
                ),
            )
            probe = json.loads(
                Path(probe_summary.output).read_text(encoding="utf-8")
            )
            official_html = """
                <html><head><script type="application/ld+json">
                {
                  "@type": "ProfessionalService",
                  "name": "테스트 탐정사무소",
                  "telephone": "02-1234-5678",
                  "address": {
                    "addressRegion": "서울특별시",
                    "addressLocality": "강남구",
                    "streetAddress": "테스트로 1"
                  }
                }
                </script></head></html>
            """.replace(
                "<html>", '<html><meta charset="euc-kr">'
            ).encode("euc-kr")
            facts_summary = extract_official_source_facts(
                local_raw_path=local_path,
                web_raw_path=Path(summary.raw_output),
                web_filtered_path=Path(summary.filtered_output),
                probe_path=Path(probe_summary.output),
                output_path=root / "naver-web-test.facts.jsonl",
                user_agent="DetectivePlatformPreflight/1.0",
                max_sources=3,
                now=datetime(2026, 8, 20, tzinfo=timezone.utc),
                fetcher=lambda *_args, **_kwargs: official_html,
            )
            facts = json.loads(
                Path(facts_summary.output).read_text(encoding="utf-8")
            )
            with self.assertRaisesRegex(
                OfficeDiscoveryError, "discovery_web_candidates_empty"
            ):
                run_naver_web_source_discovery(
                    FakeNaverClient((), web_items=web_items),  # type: ignore[arg-type]
                    local_raw_path=local_path,
                    output_dir=root,
                    duplicate_keys=_empty_duplicate_keys(),
                    registry={},
                    max_candidates=1,
                    display=3,
                    retention_days=7,
                    now=datetime(2026, 8, 20, tzinfo=timezone.utc),
                )

        self.assertEqual(summary.candidate_count, 1)
        self.assertEqual(summary.previously_processed_count, 0)
        self.assertEqual(manifest["parent_record_ids"], [local_record.record_id])
        self.assertEqual(len(manifest["candidate_identity_hashes"]), 1)
        self.assertEqual(manifest["expires_at"], local_record.expires_at)
        self.assertEqual(summary.request_count, 1)
        self.assertEqual(summary.raw_count, 3)
        self.assertEqual(summary.source_check_required_count, 1)
        self.assertEqual(summary.needs_review_count, 1)
        self.assertEqual(summary.rejected_count, 1)
        self.assertNotIn("description", raw[0])
        self.assertTrue(
            all(item["source_verification"] == "required" for item in filtered)
        )
        self.assertTrue(all(item["promotion_allowed"] is False for item in filtered))
        self.assertEqual(summary.expires_at, local_record.expires_at)
        self.assertEqual(probe_summary.candidate_count, 1)
        self.assertEqual(probe_summary.content_check_required_count, 1)
        self.assertEqual(probe["status"], "content_check_required")
        self.assertEqual(probe["source_verification"], "required")
        self.assertFalse(probe["promotion_allowed"])
        self.assertEqual(facts_summary.candidate_count, 1)
        self.assertEqual(facts_summary.strong_match_count, 1)
        self.assertEqual(facts["status"], "strong_fact_match")
        self.assertEqual(facts["phone_normalized"], "0212345678")
        self.assertTrue(facts["name_match"])
        self.assertTrue(facts["address_match"])
        self.assertFalse(facts["promotion_allowed"])

    def test_skips_same_office_across_local_queries_and_runs(self) -> None:
        web_items = (
            {
                "title": "테스트 탐정사무소 공식 홈페이지",
                "link": "https://example.com/",
                "description": "not stored",
            },
        )
        first_record = _raw(link="", record_id="first-record")
        second_record = _raw(
            link="",
            record_id="second-record",
            run_id="run-2",
            query="서울 강남구 흥신소",
        )
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            first_path = root / "naver-local-first.raw.jsonl"
            first_path.write_text(
                json.dumps(asdict(first_record), ensure_ascii=False) + "\n",
                encoding="utf-8",
            )
            run_naver_web_source_discovery(
                FakeNaverClient((), web_items=web_items),  # type: ignore[arg-type]
                local_raw_path=first_path,
                output_dir=root,
                duplicate_keys=_empty_duplicate_keys(),
                registry={},
                max_candidates=1,
                now=datetime(2026, 8, 20, tzinfo=timezone.utc),
            )
            second_path = root / "naver-local-second.raw.jsonl"
            second_path.write_text(
                json.dumps(asdict(second_record), ensure_ascii=False) + "\n",
                encoding="utf-8",
            )

            with self.assertRaisesRegex(
                OfficeDiscoveryError, "discovery_web_candidates_empty"
            ):
                run_naver_web_source_discovery(
                    FakeNaverClient((), web_items=web_items),  # type: ignore[arg-type]
                    local_raw_path=second_path,
                    output_dir=root,
                    duplicate_keys=_empty_duplicate_keys(),
                    registry={},
                    max_candidates=1,
                    now=datetime(2026, 8, 20, tzinfo=timezone.utc),
                )

    def test_remembers_web_candidate_with_zero_search_results(self) -> None:
        local_record = _raw(link="")
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            local_path = root / "naver-local-test.raw.jsonl"
            local_path.write_text(
                json.dumps(asdict(local_record), ensure_ascii=False) + "\n",
                encoding="utf-8",
            )
            with self.assertRaisesRegex(
                OfficeDiscoveryError, "discovery_web_results_empty"
            ):
                run_naver_web_source_discovery(
                    FakeNaverClient((), web_items=()),  # type: ignore[arg-type]
                    local_raw_path=local_path,
                    output_dir=root,
                    duplicate_keys=_empty_duplicate_keys(),
                    registry={},
                    max_candidates=1,
                    now=datetime(2026, 8, 20, tzinfo=timezone.utc),
                )
            retry_client = FakeNaverClient((), web_items=())
            with self.assertRaisesRegex(
                OfficeDiscoveryError, "discovery_web_candidates_empty"
            ):
                run_naver_web_source_discovery(
                    retry_client,  # type: ignore[arg-type]
                    local_raw_path=local_path,
                    output_dir=root,
                    duplicate_keys=_empty_duplicate_keys(),
                    registry={},
                    max_candidates=1,
                    now=datetime(2026, 8, 20, tzinfo=timezone.utc),
                )

            self.assertEqual(len(list(root.glob("naver-web-*.manifest.json"))), 1)
            self.assertEqual(retry_client.request_count, 0)

    def test_builds_deduplicated_manual_review_queue(self) -> None:
        first = _raw(record_id="first-record", link="")
        second = _raw(
            record_id="second-record",
            run_id="run-2",
            query="서울 강남구 흥신소",
            link="",
        )
        common = {
            "version": 1,
            "rules_version": "office-official-facts-v1",
            "record_id": "web-record",
            "run_id": "web-run",
            "source_url": "https://example.com/",
            "reason_code": None,
            "extracted_name": "테스트 탐정사무소",
            "phone_normalized": "0212345678",
            "phone_display": "02-1234-5678",
            "address_text": "서울특별시 강남구 테스트로 1",
            "name_match": True,
            "address_match": True,
            "region_match": True,
            "source_verification": "required",
            "promotion_allowed": False,
            "checked_at": "2026-08-20T01:00:00+00:00",
            "expires_at": "2026-08-27T00:00:00+00:00",
            "business_service_match": True,
            "business_service_reason_codes": ("DETECTIVE_SERVICE",),
        }
        partial = OfficialSourceFactRecord(
            **{
                **common,
                "parent_record_id": first.record_id,
                "status": "partial_fact_match",
            }
        )
        strong = OfficialSourceFactRecord(
            **{
                **common,
                "record_id": "web-record-2",
                "parent_record_id": second.record_id,
                "status": "strong_fact_match",
            }
        )
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "naver-local-first.raw.jsonl").write_text(
                json.dumps(asdict(first), ensure_ascii=False) + "\n",
                encoding="utf-8",
            )
            (root / "naver-local-second.raw.jsonl").write_text(
                json.dumps(asdict(second), ensure_ascii=False) + "\n",
                encoding="utf-8",
            )
            (root / "naver-web-test.facts.jsonl").write_text(
                "".join(
                    json.dumps(asdict(record), ensure_ascii=False) + "\n"
                    for record in (partial, strong)
                ),
                encoding="utf-8",
            )
            output = root / "naver-review-test.jsonl"
            summary = build_discovery_review_queue(
                output_dir=root,
                output_path=output,
                now=datetime(2026, 8, 20, tzinfo=timezone.utc),
            )
            review = json.loads(output.read_text(encoding="utf-8"))

        self.assertEqual(summary.fact_count, 2)
        self.assertEqual(summary.eligible_fact_count, 2)
        self.assertEqual(summary.candidate_count, 1)
        self.assertEqual(summary.duplicate_count, 1)
        self.assertEqual(review["evidence_status"], "strong_fact_match")
        self.assertEqual(review["review_status"], "pending")
        self.assertFalse(review["promotion_allowed"])

    def test_separates_irrelevant_and_incomplete_review_candidates(self) -> None:
        irrelevant = _raw(
            record_id="irrelevant-record",
            title="명탐정 코난 추리게임 팝업",
            category="전시,행사",
        )
        incomplete = _raw(
            record_id="incomplete-record",
            title="검증 탐정사무소",
            category="서비스>탐정",
            road_address="서울특별시 강남구 검증로 2",
        )
        common = {
            "version": 2,
            "rules_version": "office-official-facts-v2",
            "run_id": "web-run",
            "source_url": "https://official-example.test/",
            "reason_code": None,
            "extracted_name": None,
            "phone_normalized": "0212345678",
            "phone_display": "02-1234-5678",
            "address_text": "서울특별시 강남구 테스트로 1",
            "name_match": True,
            "address_match": True,
            "region_match": True,
            "source_verification": "required",
            "promotion_allowed": False,
            "checked_at": "2026-08-20T01:00:00+00:00",
            "expires_at": "2026-08-27T00:00:00+00:00",
            "business_service_reason_codes": (),
        }
        irrelevant_fact = OfficialSourceFactRecord(
            **{
                **common,
                "record_id": "irrelevant-fact",
                "parent_record_id": irrelevant.record_id,
                "status": "strong_fact_match",
                "business_service_match": True,
            }
        )
        incomplete_fact = OfficialSourceFactRecord(
            **{
                **common,
                "record_id": "incomplete-fact",
                "parent_record_id": incomplete.record_id,
                "source_url": "https://second-official-example.test/",
                "status": "partial_fact_match",
                "business_service_match": False,
            }
        )

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "naver-local-test.raw.jsonl").write_text(
                "".join(
                    json.dumps(asdict(record), ensure_ascii=False) + "\n"
                    for record in (irrelevant, incomplete)
                ),
                encoding="utf-8",
            )
            (root / "naver-web-test.facts.jsonl").write_text(
                "".join(
                    json.dumps(asdict(record), ensure_ascii=False) + "\n"
                    for record in (irrelevant_fact, incomplete_fact)
                ),
                encoding="utf-8",
            )
            output = root / "naver-review-test.jsonl"
            summary = build_discovery_review_queue(
                output_dir=root,
                output_path=output,
                now=datetime(2026, 8, 20, tzinfo=timezone.utc),
            )
            review_text = output.read_text(encoding="utf-8")
            research = json.loads(
                output.with_name(
                    "naver-review-test.research.jsonl"
                ).read_text(encoding="utf-8")
            )

        self.assertEqual(summary.candidate_count, 0)
        self.assertEqual(summary.research_count, 1)
        self.assertEqual(review_text, "")
        self.assertEqual(research["candidate_name"], "검증 탐정사무소")
        self.assertIn(
            "STRONG_FACT_MATCH_REQUIRED",
            research["research_reason_codes"],
        )
        self.assertIn(
            "OFFICIAL_SERVICE_EVIDENCE_REQUIRED",
            research["research_reason_codes"],
        )
        self.assertEqual(
            summary.reason_counts["BUSINESS_RELEVANCE_IRRELEVANT"], 1
        )

    def test_rejects_invalid_raw_jsonl_without_partial_result(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "raw.jsonl"
            path.write_text('{"version":1}\n', encoding="utf-8")
            with self.assertRaisesRegex(
                OfficeDiscoveryError, "discovery_raw_record_invalid_at_line_1"
            ):
                load_raw_discovery_records(path)


if __name__ == "__main__":
    unittest.main()
