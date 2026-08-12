from __future__ import annotations

import time
from collections.abc import Callable

import psycopg

from collector.adapters import JsonLdLocalBusinessAdapter
from collector.adapters.jsonld import AdapterError
from collector.change_detection import propose_review
from collector.http_client import CollectorHttpError, PolicyHttpClient
from collector.models import ConditionalMetadata, RunSummary, SourcePolicy
from collector.normalize import is_viable_candidate, normalize_record
from collector.repository import CollectorRepository, derive_run_status


class CollectorPipeline:
    def __init__(
        self,
        policy: SourcePolicy,
        repository: CollectorRepository,
        *,
        client_factory: Callable[[SourcePolicy], PolicyHttpClient] | None = None,
        sleep: Callable[[float], None] = time.sleep,
    ) -> None:
        self._policy = policy
        self._repository = repository
        self._client_factory = client_factory or (lambda item: PolicyHttpClient(item))
        self._sleep = sleep
        if policy.adapter != JsonLdLocalBusinessAdapter.name:
            raise ValueError("unsupported_adapter")
        self._adapter = JsonLdLocalBusinessAdapter()

    def run(self) -> RunSummary:
        summary = RunSummary(
            source_name=self._policy.name,
            discovered_count=len(self._policy.start_urls),
        )
        summary.run_id = self._repository.create_run(self._policy)
        try:
            with self._client_factory(self._policy) as client:
                for index, source_url in enumerate(self._policy.start_urls):
                    if index:
                        self._sleep(self._policy.request_interval_seconds)
                    self._collect_url(source_url, client, summary)
        except Exception:
            summary.add_error("unexpected_collection_failure")
            raise
        finally:
            summary.status = derive_run_status(summary)
            self._repository.finish_run(summary)
        return summary

    def _collect_url(
        self,
        source_url: str,
        client: PolicyHttpClient,
        summary: RunSummary,
    ) -> None:
        prior_for_url = self._repository.find_prior_record_for_url(
            self._policy, source_url
        )
        conditional = (
            ConditionalMetadata(
                etag=prior_for_url.etag,
                last_modified=prior_for_url.last_modified,
            )
            if prior_for_url
            else None
        )
        try:
            fetched = client.fetch(source_url, conditional)
            if fetched.not_modified:
                summary.unchanged_count += 1
                return
            if fetched.body is None:
                summary.add_error("empty_response")
                return
            extracted_records = self._adapter.extract(
                fetched.body, source_url, self._policy
            )
            if not extracted_records:
                summary.add_error("no_supported_records")
                return
            if len(extracted_records) > 1:
                summary.add_error("ambiguous_supported_records")
                return
        except CollectorHttpError as exc:
            summary.add_error(exc.code)
            return
        except AdapterError as exc:
            summary.add_error(str(exc))
            return

        for extracted in extracted_records:
            record = normalize_record(extracted)
            prior = self._repository.find_prior_record(
                self._policy, record.source_record_key
            )
            office = self._repository.find_office_by_source_url(record.source_url)
            unchanged = prior is not None and prior.content_hash == record.content_hash
            review = None if unchanged else propose_review(record, office)
            try:
                created_review = self._repository.persist_record(
                    summary.run_id,
                    record,
                    fetched.etag,
                    fetched.last_modified,
                    office,
                    review,
                )
            except (psycopg.Error, RuntimeError):
                summary.add_error("database_write_failed")
                continue

            summary.collected_count += 1
            if unchanged:
                summary.unchanged_count += 1
            if created_review:
                summary.review_count += 1
            elif not unchanged and not is_viable_candidate(record):
                summary.add_error("candidate_validation_failed")
