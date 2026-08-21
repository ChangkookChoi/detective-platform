from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from typing import Literal, TypeAlias

JSONScalar: TypeAlias = str | int | float | bool | None
JSONValue: TypeAlias = JSONScalar | list["JSONValue"] | dict[str, "JSONValue"]


@dataclass(frozen=True)
class TimeoutPolicy:
    connect_seconds: float
    read_seconds: float
    write_seconds: float
    pool_seconds: float


@dataclass(frozen=True)
class RetryPolicy:
    max_attempts: int
    initial_backoff_seconds: float
    max_backoff_seconds: float


@dataclass(frozen=True)
class SourcePolicy:
    name: str
    adapter: str
    extractor_version: str
    start_urls: tuple[str, ...]
    allowed_hosts: tuple[str, ...]
    allowed_path_prefixes: tuple[str, ...]
    allowed_fields: frozenset[str]
    allowed_schema_types: frozenset[str]
    policy_checked_by: str
    policy_checked_at: date
    robots_checked_by: str
    robots_checked_at: date
    robots_allowed: bool
    user_agent: str
    request_interval_seconds: float
    max_response_bytes: int
    max_redirects: int
    timeout: TimeoutPolicy
    retry: RetryPolicy


@dataclass(frozen=True)
class ConditionalMetadata:
    etag: str | None = None
    last_modified: str | None = None


@dataclass(frozen=True)
class FetchResult:
    url: str
    status_code: int
    body: bytes | None
    etag: str | None
    last_modified: str | None
    not_modified: bool = False


@dataclass(frozen=True)
class ExtractedRecord:
    source_url: str
    source_record_key: str
    extracted_values: dict[str, JSONValue]


@dataclass(frozen=True)
class NormalizedRecord:
    source_url: str
    source_record_key: str
    extracted_values: dict[str, JSONValue]
    normalized_values: dict[str, JSONValue]
    content_hash: str


@dataclass(frozen=True)
class OfficeSnapshot:
    id: str
    name: str
    phone_normalized: str | None
    phone_display: str | None
    email_normalized: str | None
    email_display: str | None
    email_kind: str | None
    address_text: str | None
    summary: str | None


@dataclass(frozen=True)
class PriorRecord:
    content_hash: str
    etag: str | None
    last_modified: str | None


ReviewType: TypeAlias = Literal["new_office", "field_change"]
ReviewRisk: TypeAlias = Literal["medium", "high"]


@dataclass(frozen=True)
class ReviewProposal:
    type: ReviewType
    risk: ReviewRisk
    previous_values: dict[str, JSONValue] | None
    proposed_values: dict[str, JSONValue]
    cause: str


RunStatus: TypeAlias = Literal["succeeded", "partially_failed", "failed"]


@dataclass
class RunSummary:
    source_name: str
    run_id: str = ""
    discovered_count: int = 0
    collected_count: int = 0
    unchanged_count: int = 0
    review_count: int = 0
    failed_count: int = 0
    error_codes: dict[str, int] = field(default_factory=dict)
    status: RunStatus = "failed"

    def add_error(self, code: str) -> None:
        self.failed_count += 1
        self.error_codes[code] = self.error_codes.get(code, 0) + 1
