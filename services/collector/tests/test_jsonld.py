from __future__ import annotations

import unittest
from pathlib import Path

from collector.adapters import JsonLdLocalBusinessAdapter
from collector.normalize import normalize_record
from tests.helpers import source_policy


class JsonLdAdapterTest(unittest.TestCase):
    def test_extracts_only_allowed_fields_and_normalizes(self) -> None:
        html = (Path(__file__).parent / "fixtures" / "office.html").read_bytes()
        records = JsonLdLocalBusinessAdapter().extract(
            html,
            "https://example.com/offices/sample",
            source_policy(),
        )

        self.assertEqual(len(records), 1)
        self.assertNotIn("email", records[0].extracted_values)
        self.assertNotIn("email", records[0].extracted_values["address"])
        normalized = normalize_record(records[0])
        self.assertEqual(normalized.source_record_key, "office-001")
        self.assertEqual(normalized.normalized_values["name"], "테스트 탐정사무소")
        self.assertEqual(normalized.normalized_values["phoneNormalized"], "0212345678")
        self.assertEqual(
            normalized.normalized_values["addressText"],
            "01234 서울특별시 강남구 테헤란로 1",
        )
        self.assertEqual(len(normalized.content_hash), 64)

    def test_ignores_malformed_jsonld_and_unapproved_types(self) -> None:
        html = b"""
        <script type="application/ld+json">invalid</script>
        <script type="application/ld+json">
          {"@type":"Person","name":"Not an office"}
        </script>
        """
        records = JsonLdLocalBusinessAdapter().extract(
            html,
            "https://example.com/offices/sample",
            source_policy(),
        )
        self.assertEqual(records, [])


if __name__ == "__main__":
    unittest.main()
