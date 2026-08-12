from __future__ import annotations

import os
import unittest

import psycopg


class CollectorPermissionIntegrationTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        collector_database_url = os.environ.get("COLLECTOR_DATABASE_URL")
        if not collector_database_url:
            raise unittest.SkipTest("COLLECTOR_DATABASE_URL is required")
        cls.collector_database_url = collector_database_url

    def test_required_candidate_permissions_are_granted(self) -> None:
        with psycopg.connect(self.collector_database_url) as connection:
            current_user = connection.execute("SELECT current_user").fetchone()
            self.assertEqual(current_user, ("detective_platform_collector",))

            connection.execute("SELECT id FROM offices LIMIT 1")
            connection.execute("SELECT id FROM office_sources LIMIT 1")
            run_id = connection.execute(
                """
                INSERT INTO collection_runs (
                    source_name, adapter_name, extractor_version, status
                ) VALUES (
                    'collector-permission-test',
                    'jsonld_detail',
                    'permission-test',
                    'running'
                )
                RETURNING id
                """
            ).fetchone()[0]
            record_id = connection.execute(
                """
                INSERT INTO collected_records (
                    collection_run_id,
                    source_url,
                    source_record_key,
                    extracted_values,
                    normalized_values,
                    content_hash
                ) VALUES (
                    %s,
                    'https://example.com/permission-test',
                    'permission-test',
                    '{}'::jsonb,
                    '{}'::jsonb,
                    'permission-test'
                )
                RETURNING id
                """,
                (run_id,),
            ).fetchone()[0]
            connection.execute(
                """
                INSERT INTO review_items (
                    collected_record_id,
                    type,
                    risk,
                    status,
                    proposed_values,
                    cause
                ) VALUES (
                    %s,
                    'new_office',
                    'high',
                    'pending',
                    '{}'::jsonb,
                    'collector_permission_test'
                )
                """,
                (record_id,),
            )
            connection.execute(
                """
                UPDATE collection_runs
                SET status = 'succeeded', finished_at = now()
                WHERE id = %s
                """,
                (run_id,),
            )
            connection.rollback()

    def assert_denied(self, statement: str) -> None:
        with psycopg.connect(self.collector_database_url) as connection:
            with self.assertRaises(psycopg.errors.InsufficientPrivilege):
                connection.execute(statement)
            connection.rollback()

    def test_operational_and_review_data_mutations_are_denied(self) -> None:
        self.assert_denied(
            "UPDATE offices SET updated_at = updated_at WHERE false"
        )
        self.assert_denied("DELETE FROM review_items WHERE false")
        self.assert_denied("SELECT id FROM review_items LIMIT 1")
        self.assert_denied(
            "CREATE TABLE collector_permission_escape (id integer)"
        )


if __name__ == "__main__":
    unittest.main()
