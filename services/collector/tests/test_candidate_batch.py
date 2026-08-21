from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from collector.candidate_batch import (
    CandidateBatchError,
    candidate_has_blocking_duplicate,
    candidate_matches_published,
    candidate_duplicate_reasons,
    load_candidate_batch,
    load_source_registry,
    _is_same_site_host,
    normalize_address_key,
    normalize_phone_key,
    page_has_invalid_marker,
    robots_explicitly_blocks_ai,
)


def _manifest() -> dict[str, object]:
    return {
        "version": 1,
        "batchId": "2026-08-13-test",
        "verifiedAt": "2026-08-13",
        "candidates": [
            {
                "sourceUrl": "https://example.com/office#ignored",
                "name": "테스트 탐정사무소",
                "phoneDisplay": "02-1234-5678",
                "emailDisplay": "Info@Example.com",
                "addressText": "서울특별시 강남구 테스트로 1",
                "slug": "test-detective-gangnam",
                "regionSlug": "seoul-gangnam",
                "serviceCategorySlugs": ["family", "evidence-fact-checking"],
                "sourceType": "official_website",
                "evidenceNote": "공식 푸터와 업무 안내에서 최소 사실 필드를 확인",
                "manualPolicyReviewed": False,
            }
        ],
    }


class CandidateBatchTests(unittest.TestCase):
    def test_allows_www_redirect_but_rejects_cross_site_redirect(self) -> None:
        self.assertTrue(_is_same_site_host("example.com", "www.example.com"))
        self.assertTrue(_is_same_site_host("www.example.com", "example.com"))
        self.assertFalse(_is_same_site_host("example.com", "example.net"))

    def test_loads_and_normalizes_manifest(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "batch.json"
            path.write_text(json.dumps(_manifest()), encoding="utf-8")
            batch = load_candidate_batch(path)

        self.assertEqual(batch.batch_id, "2026-08-13-test")
        self.assertEqual(batch.candidates[0].source_url, "https://example.com/office")
        self.assertEqual(
            batch.candidates[0].service_category_slugs,
            ("family", "evidence-fact-checking"),
        )
        self.assertEqual(batch.candidates[0].email_display, "Info@Example.com")

    def test_rejects_invalid_optional_business_email(self) -> None:
        manifest = _manifest()
        manifest["candidates"][0]["emailDisplay"] = "first@example.com,second@example.com"
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "batch.json"
            path.write_text(json.dumps(manifest), encoding="utf-8")
            with self.assertRaisesRegex(
                CandidateBatchError, "emailDisplay_invalid"
            ):
                load_candidate_batch(path)

    def test_requires_explicit_review_for_shared_source_urls(self) -> None:
        manifest = _manifest()
        manifest["candidates"] = [
            manifest["candidates"][0],
            {
                **manifest["candidates"][0],
                "slug": "another-test-office",
                "addressText": "서울특별시 강남구 테스트로 2",
            },
        ]
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "batch.json"
            path.write_text(json.dumps(manifest), encoding="utf-8")
            with self.assertRaisesRegex(
                CandidateBatchError,
                "shared_source_requires_distinct_branch_review",
            ):
                load_candidate_batch(path)

    def test_allows_reviewed_branches_with_shared_source_urls(self) -> None:
        manifest = _manifest()
        first = {
            **manifest["candidates"][0],
            "distinctBranchReviewed": True,
        }
        second = {
            **first,
            "slug": "another-test-office",
            "addressText": "서울특별시 강남구 테스트로 2",
        }
        manifest["candidates"] = [first, second]
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "batch.json"
            path.write_text(json.dumps(manifest), encoding="utf-8")
            batch = load_candidate_batch(path)

        self.assertEqual(len(batch.candidates), 2)
        self.assertTrue(batch.candidates[0].distinct_branch_reviewed)

    def test_rejects_same_source_and_address_even_as_reviewed_branches(self) -> None:
        manifest = _manifest()
        candidate = {
            **manifest["candidates"][0],
            "distinctBranchReviewed": True,
        }
        manifest["candidates"] = [
            candidate,
            {**candidate, "slug": "another-test-office"},
        ]
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "batch.json"
            path.write_text(json.dumps(manifest), encoding="utf-8")
            with self.assertRaisesRegex(
                CandidateBatchError, "duplicate_source_address_in_manifest"
            ):
                load_candidate_batch(path)

    def test_accepts_eight_digit_nationwide_phone_number(self) -> None:
        manifest = _manifest()
        manifest["candidates"][0]["phoneDisplay"] = "1661-9782"
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "batch.json"
            path.write_text(json.dumps(manifest), encoding="utf-8")
            batch = load_candidate_batch(path)

        self.assertEqual(batch.candidates[0].phone_display, "1661-9782")

    def test_normalizes_korean_country_code_for_duplicate_matching(self) -> None:
        self.assertEqual(
            normalize_phone_key("+82-10-4741-9991"),
            normalize_phone_key("010-4741-9991"),
        )
        self.assertEqual(
            normalize_phone_key("+82-2-1234-5678"),
            normalize_phone_key("02-1234-5678"),
        )

    def test_normalizes_postal_code_and_address_separators(self) -> None:
        self.assertEqual(
            normalize_address_key("01000 서울특별시 강북구 도봉로 191"),
            normalize_address_key("서울특별시 강북구 도봉로 191"),
        )
        self.assertEqual(
            normalize_address_key("경기도 안산시 중앙대로 951, 301호 (고잔동)"),
            normalize_address_key("경기도 안산시 중앙대로951 301호 고잔동"),
        )

    def test_parses_machine_readable_registry_table(self) -> None:
        content = """# registry
| 출처 | 확인 | 상태 |
| --- | --- | --- |
| `example.com/path` | 확인 | `deferred` — 재확인 필요 |
| `approved.example` | 확인 | `manual_approved` — 공개 |
"""
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "registry.md"
            path.write_text(content, encoding="utf-8")
            registry = load_source_registry(path)

        self.assertEqual(registry["example.com"].status, "deferred")
        self.assertEqual(registry["approved.example"].status, "manual_approved")

    def test_detects_explicit_ai_block(self) -> None:
        self.assertTrue(
            robots_explicitly_blocks_ai(
                "User-agent: GPTBot\nDisallow: /\nUser-agent: *\nDisallow:"
            )
        )
        self.assertFalse(
            robots_explicitly_blocks_ai("User-agent: *\nDisallow: /private")
        )

    def test_detects_expired_hosting_page(self) -> None:
        self.assertTrue(page_has_invalid_marker("사이트 기간 만료".encode()))
        self.assertFalse(page_has_invalid_marker("정상 공식 홈페이지".encode()))

    def test_reports_database_duplicate_dimensions(self) -> None:
        manifest = _manifest()
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "batch.json"
            path.write_text(json.dumps(manifest), encoding="utf-8")
            candidate = load_candidate_batch(path).candidates[0]
        keys = {
            "source": {candidate.source_url},
            "name": set(),
            "phone": {"0212345678"},
            "address": set(),
            "slug": set(),
        }
        self.assertEqual(
            candidate_duplicate_reasons(candidate, keys), ["source", "phone"]
        )
        self.assertTrue(candidate_has_blocking_duplicate(candidate, ["source"]))

    def test_allows_reviewed_branch_when_address_and_slug_are_unique(self) -> None:
        manifest = _manifest()
        manifest["candidates"][0]["distinctBranchReviewed"] = True
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "batch.json"
            path.write_text(json.dumps(manifest), encoding="utf-8")
            candidate = load_candidate_batch(path).candidates[0]

        self.assertFalse(
            candidate_has_blocking_duplicate(candidate, ["source", "name", "phone"])
        )
        self.assertTrue(candidate_has_blocking_duplicate(candidate, ["address"]))

    def test_recognizes_exact_published_candidate_for_batch_resume(self) -> None:
        manifest = _manifest()
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "batch.json"
            path.write_text(json.dumps(manifest), encoding="utf-8")
            candidate = load_candidate_batch(path).candidates[0]
        published = {
            "name": candidate.name,
            "phoneDisplay": candidate.phone_display,
            "emailDisplay": candidate.email_display,
            "addressText": candidate.address_text,
            "regionSlug": candidate.region_slug,
            "sourceUrl": candidate.source_url,
            "serviceCategorySlugs": sorted(candidate.service_category_slugs),
        }
        self.assertTrue(candidate_matches_published(candidate, published))
        self.assertFalse(
            candidate_matches_published(candidate, {**published, "name": "다른 업체"})
        )


if __name__ == "__main__":
    unittest.main()
