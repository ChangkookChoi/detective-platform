from __future__ import annotations

import json

import psycopg
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb

from collector.models import (
    NormalizedRecord,
    OfficeSnapshot,
    PriorRecord,
    ReviewProposal,
    RunStatus,
    RunSummary,
    SourcePolicy,
)


class CollectorRepository:
    def __init__(self, database_url: str) -> None:
        self._connection = psycopg.connect(
            database_url,
            autocommit=True,
            row_factory=dict_row,
        )

    def __enter__(self) -> CollectorRepository:
        return self

    def __exit__(self, *_: object) -> None:
        self.close()

    def close(self) -> None:
        self._connection.close()

    def create_run(self, policy: SourcePolicy) -> str:
        row = self._connection.execute(
            """
            INSERT INTO collection_runs (
                source_name, adapter_name, extractor_version, status
            ) VALUES (%s, %s, %s, 'running')
            RETURNING id
            """,
            (policy.name, policy.adapter, policy.extractor_version),
        ).fetchone()
        if row is None:
            raise RuntimeError("collection_run_not_created")
        return str(row["id"])

    def finish_run(self, summary: RunSummary) -> None:
        error_summary = (
            json.dumps(summary.error_codes, sort_keys=True, separators=(",", ":"))
            if summary.error_codes
            else None
        )
        self._connection.execute(
            """
            UPDATE collection_runs
            SET status = %s,
                finished_at = now(),
                discovered_count = %s,
                collected_count = %s,
                failed_count = %s,
                error_summary = %s
            WHERE id = %s
            """,
            (
                summary.status,
                summary.discovered_count,
                summary.collected_count,
                summary.failed_count,
                error_summary,
                summary.run_id,
            ),
        )

    def find_prior_record(
        self, policy: SourcePolicy, source_record_key: str
    ) -> PriorRecord | None:
        row = self._connection.execute(
            """
            SELECT record.content_hash, record.etag, record.last_modified
            FROM collected_records AS record
            INNER JOIN collection_runs AS run
                ON run.id = record.collection_run_id
            WHERE run.source_name = %s
              AND run.adapter_name = %s
              AND run.extractor_version = %s
              AND record.source_record_key = %s
            ORDER BY record.collected_at DESC, record.id DESC
            LIMIT 1
            """,
            (
                policy.name,
                policy.adapter,
                policy.extractor_version,
                source_record_key,
            ),
        ).fetchone()
        if row is None:
            return None
        return PriorRecord(
            content_hash=row["content_hash"],
            etag=row["etag"],
            last_modified=row["last_modified"],
        )

    def find_prior_record_for_url(
        self, policy: SourcePolicy, source_url: str
    ) -> PriorRecord | None:
        row = self._connection.execute(
            """
            SELECT record.content_hash, record.etag, record.last_modified
            FROM collected_records AS record
            INNER JOIN collection_runs AS run
                ON run.id = record.collection_run_id
            WHERE run.source_name = %s
              AND run.adapter_name = %s
              AND run.extractor_version = %s
              AND record.source_url = %s
            ORDER BY record.collected_at DESC, record.id DESC
            LIMIT 1
            """,
            (
                policy.name,
                policy.adapter,
                policy.extractor_version,
                source_url,
            ),
        ).fetchone()
        if row is None:
            return None
        return PriorRecord(
            content_hash=row["content_hash"],
            etag=row["etag"],
            last_modified=row["last_modified"],
        )

    def find_office_by_source_url(self, source_url: str) -> OfficeSnapshot | None:
        row = self._connection.execute(
            """
            SELECT office.id,
                   office.name,
                   office.phone_normalized,
                   office.phone_display,
                   office.email_normalized,
                   office.email_display,
                   office.email_kind,
                   office.address_text,
                   office.summary
            FROM office_sources AS source
            INNER JOIN offices AS office ON office.id = source.office_id
            WHERE source.url = %s
            ORDER BY source.is_primary DESC, source.id
            LIMIT 1
            """,
            (source_url,),
        ).fetchone()
        if row is None:
            return None
        return OfficeSnapshot(
            id=str(row["id"]),
            name=row["name"],
            phone_normalized=row["phone_normalized"],
            phone_display=row["phone_display"],
            email_normalized=row["email_normalized"],
            email_display=row["email_display"],
            email_kind=row["email_kind"],
            address_text=row["address_text"],
            summary=row["summary"],
        )

    def persist_record(
        self,
        run_id: str,
        record: NormalizedRecord,
        etag: str | None,
        last_modified: str | None,
        office: OfficeSnapshot | None,
        review: ReviewProposal | None,
    ) -> bool:
        with self._connection.transaction():
            row = self._connection.execute(
                """
                INSERT INTO collected_records (
                    collection_run_id,
                    source_url,
                    source_record_key,
                    extracted_values,
                    normalized_values,
                    content_hash,
                    etag,
                    last_modified
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING id
                """,
                (
                    run_id,
                    record.source_url,
                    record.source_record_key,
                    Jsonb(record.extracted_values),
                    Jsonb(record.normalized_values),
                    record.content_hash,
                    etag,
                    last_modified,
                ),
            ).fetchone()
            if row is None:
                raise RuntimeError("collected_record_not_created")
            if review is None:
                return False
            self._connection.execute(
                """
                INSERT INTO review_items (
                    office_id,
                    collected_record_id,
                    type,
                    risk,
                    status,
                    previous_values,
                    proposed_values,
                    cause
                ) VALUES (%s, %s, %s, %s, 'pending', %s, %s, %s)
                """,
                (
                    office.id if office else None,
                    row["id"],
                    review.type,
                    review.risk,
                    Jsonb(review.previous_values)
                    if review.previous_values is not None
                    else None,
                    Jsonb(review.proposed_values),
                    review.cause,
                ),
            )
        return True


def derive_run_status(summary: RunSummary) -> RunStatus:
    if summary.failed_count == 0:
        return "succeeded"
    if summary.collected_count > 0 or summary.unchanged_count > 0:
        return "partially_failed"
    return "failed"
