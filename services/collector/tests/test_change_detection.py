from __future__ import annotations

import unittest

from collector.change_detection import propose_review
from collector.models import NormalizedRecord, OfficeSnapshot


def _record(values: dict[str, str]) -> NormalizedRecord:
    return NormalizedRecord(
        source_url="https://example.com/offices/sample",
        source_record_key="office-001",
        extracted_values={},
        normalized_values=values,
        content_hash="hash",
    )


class ChangeDetectionTest(unittest.TestCase):
    def setUp(self) -> None:
        self.office = OfficeSnapshot(
            id="office-id",
            name="테스트 탐정사무소",
            phone_normalized="0212345678",
            phone_display="02-1234-5678",
            address_text="서울 강남구",
            summary="기존 설명",
        )

    def test_missing_extracted_field_does_not_clear_operating_value(self) -> None:
        review = propose_review(
            _record(
                {
                    "name": self.office.name,
                    "phoneNormalized": self.office.phone_normalized or "",
                    "phoneDisplay": self.office.phone_display or "",
                    "addressText": self.office.address_text or "",
                }
            ),
            self.office,
        )
        self.assertIsNone(review)

    def test_phone_change_creates_high_risk_field_review(self) -> None:
        review = propose_review(
            _record(
                {
                    "name": self.office.name,
                    "phoneNormalized": "0211112222",
                    "phoneDisplay": "02-1111-2222",
                    "addressText": self.office.address_text or "",
                }
            ),
            self.office,
        )
        self.assertIsNotNone(review)
        assert review is not None
        self.assertEqual(review.type, "field_change")
        self.assertEqual(review.risk, "high")
        self.assertEqual(
            review.proposed_values,
            {
                "phoneNormalized": "0211112222",
                "phoneDisplay": "02-1111-2222",
            },
        )

    def test_new_office_requires_name_and_contact_or_address(self) -> None:
        self.assertIsNone(propose_review(_record({"name": "이름만 있음"}), None))
        review = propose_review(
            _record({"name": "신규 사무소", "addressText": "서울 강남구"}),
            None,
        )
        self.assertIsNotNone(review)
        assert review is not None
        self.assertEqual(review.type, "new_office")
        self.assertEqual(review.risk, "high")


if __name__ == "__main__":
    unittest.main()
