from __future__ import annotations

import os
import unittest
from dataclasses import replace

import httpx
import psycopg

from collector.http_client import PolicyHttpClient
from collector.pipeline import CollectorPipeline
from collector.repository import CollectorRepository
from tests.helpers import source_policy

REGION_ID = "92000000-0000-4000-8000-000000000001"
OFFICE_ID = "92000000-0000-4000-8000-000000000002"
SOURCE_NAME = "collector-integration-source"
MATCHED_URL = "https://example.com/offices/existing"
NEW_URL = "https://example.com/offices/new"


def _html(
    record_id: str,
    name: str,
    phone: str,
    address: str,
    description: str = "검증용 설명",
) -> bytes:
    return f"""
    <!doctype html><html><head>
      <script type="application/ld+json">
      {{
        "@type": "ProfessionalService",
        "@id": "{record_id}",
        "name": "{name}",
        "telephone": "{phone}",
        "address": "{address}",
        "description": "{description}"
      }}
      </script>
    </head><body></body></html>
    """.encode()


class CollectorIntegrationTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        database_url = os.environ.get("DATABASE_URL")
        if not database_url:
            raise unittest.SkipTest("DATABASE_URL is required")
        cls.database_url = database_url
        cls.collector_database_url = os.environ.get(
            "COLLECTOR_DATABASE_URL",
            database_url,
        )
        cls.connection = psycopg.connect(database_url, autocommit=True)
        cls._cleanup()
        cls.connection.execute(
            """
            INSERT INTO regions (id, type, name, slug)
            VALUES (%s, 'district', '수집기 검증 지역', 'collector-integration-region')
            """,
            (REGION_ID,),
        )
        cls.connection.execute(
            """
            INSERT INTO offices (
                id, slug, name, summary, phone_normalized, phone_display,
                address_text, region_id, status
            ) VALUES (
                %s, 'collector-integration-office', '기존 검증 사무소',
                '검증용 설명', '0212345678', '02-1234-5678', '서울 강남구',
                %s, 'draft'
            )
            """,
            (OFFICE_ID, REGION_ID),
        )
        cls.connection.execute(
            """
            INSERT INTO office_sources (office_id, source_type, url, is_primary)
            VALUES (%s, 'official_website', %s, true)
            """,
            (OFFICE_ID, MATCHED_URL),
        )

    @classmethod
    def tearDownClass(cls) -> None:
        cls._cleanup()
        cls.connection.close()

    @classmethod
    def _cleanup(cls) -> None:
        cls.connection.execute(
            """
            DELETE FROM review_items
            WHERE collected_record_id IN (
                SELECT record.id
                FROM collected_records AS record
                INNER JOIN collection_runs AS run
                    ON run.id = record.collection_run_id
                WHERE run.source_name = %s
            )
            """,
            (SOURCE_NAME,),
        )
        cls.connection.execute(
            "DELETE FROM collection_runs WHERE source_name = %s",
            (SOURCE_NAME,),
        )
        cls.connection.execute("DELETE FROM offices WHERE id = %s", (OFFICE_ID,))
        cls.connection.execute("DELETE FROM regions WHERE id = %s", (REGION_ID,))

    def _run(
        self,
        url: str,
        html: bytes,
        etag: str,
        *,
        extractor_version: str | None = None,
    ) -> tuple[object, list[str | None]]:
        conditional_headers: list[str | None] = []

        def handler(request: httpx.Request) -> httpx.Response:
            conditional_headers.append(request.headers.get("If-None-Match"))
            return httpx.Response(200, content=html, headers={"ETag": etag})

        policy = replace(
            source_policy(),
            name=SOURCE_NAME,
            start_urls=(url,),
            extractor_version=extractor_version
            or source_policy().extractor_version,
        )

        def client_factory(item):
            return PolicyHttpClient(
                item,
                transport=httpx.MockTransport(handler),
                resolver=lambda _: ["8.8.8.8"],
                sleep=lambda _: None,
            )

        with CollectorRepository(self.collector_database_url) as repository:
            summary = CollectorPipeline(
                policy,
                repository,
                client_factory=client_factory,
                sleep=lambda _: None,
            ).run()
        return summary, conditional_headers

    def test_change_detection_review_boundary_and_conditional_metadata(self) -> None:
        initial = _html(
            "existing-office",
            "기존 검증 사무소",
            "02-1234-5678",
            "서울 강남구",
        )
        first, first_headers = self._run(MATCHED_URL, initial, '"v1"')
        self.assertEqual(first.status, "succeeded")
        self.assertEqual(first.review_count, 0)
        self.assertEqual(first_headers, [None])

        version_changed, version_changed_headers = self._run(
            MATCHED_URL,
            initial,
            '"v1-jsonld-v2"',
            extractor_version="jsonld-v2",
        )
        self.assertEqual(version_changed.status, "succeeded")
        self.assertEqual(version_changed.review_count, 0)
        self.assertEqual(version_changed.unchanged_count, 0)
        self.assertEqual(version_changed_headers, [None])

        changed = _html(
            "existing-office",
            "기존 검증 사무소",
            "02-9999-8888",
            "서울 강남구",
        )
        second, second_headers = self._run(MATCHED_URL, changed, '"v2"')
        self.assertEqual(second.status, "succeeded")
        self.assertEqual(second.review_count, 1)
        self.assertEqual(second_headers, ['"v1"'])

        repeated, repeated_headers = self._run(MATCHED_URL, changed, '"v2"')
        self.assertEqual(repeated.review_count, 0)
        self.assertEqual(repeated.unchanged_count, 1)
        self.assertEqual(repeated_headers, ['"v2"'])

        new_office = _html(
            "new-office",
            "신규 검증 사무소",
            "031-123-4567",
            "경기 수원시",
        )
        new_result, _ = self._run(NEW_URL, new_office, '"new-v1"')
        self.assertEqual(new_result.review_count, 1)

        office_row = self.connection.execute(
            """
            SELECT phone_normalized, phone_display
            FROM offices WHERE id = %s
            """,
            (OFFICE_ID,),
        ).fetchone()
        self.assertEqual(office_row, ("0212345678", "02-1234-5678"))

        review_rows = self.connection.execute(
            """
            SELECT item.type, item.risk, item.office_id, item.proposed_values
            FROM review_items AS item
            INNER JOIN collected_records AS record
                ON record.id = item.collected_record_id
            INNER JOIN collection_runs AS run
                ON run.id = record.collection_run_id
            WHERE run.source_name = %s
            ORDER BY item.created_at
            """,
            (SOURCE_NAME,),
        ).fetchall()
        self.assertEqual(len(review_rows), 2)
        self.assertEqual(review_rows[0][0:2], ("field_change", "high"))
        self.assertEqual(str(review_rows[0][2]), OFFICE_ID)
        self.assertEqual(review_rows[0][3]["phoneNormalized"], "0299998888")
        self.assertEqual(review_rows[1][0:3], ("new_office", "high", None))

        metadata = self.connection.execute(
            """
            SELECT etag, last_modified
            FROM collected_records AS record
            INNER JOIN collection_runs AS run
                ON run.id = record.collection_run_id
            WHERE run.source_name = %s
            ORDER BY record.collected_at DESC, record.id DESC
            LIMIT 1
            """,
            (SOURCE_NAME,),
        ).fetchone()
        self.assertEqual(metadata, ('"new-v1"', None))


if __name__ == "__main__":
    unittest.main()
