from __future__ import annotations

from datetime import date

from collector.models import RetryPolicy, SourcePolicy, TimeoutPolicy


def source_policy(**overrides: object) -> SourcePolicy:
    values: dict[str, object] = {
        "name": "test-source",
        "adapter": "jsonld_local_business",
        "extractor_version": "jsonld-v1",
        "start_urls": ("https://example.com/offices/sample",),
        "allowed_hosts": ("example.com",),
        "allowed_path_prefixes": ("/offices/",),
        "allowed_fields": frozenset(
            {"name", "telephone", "address", "description"}
        ),
        "allowed_schema_types": frozenset(
            {"LocalBusiness", "ProfessionalService", "Organization"}
        ),
        "policy_checked_by": "tester",
        "policy_checked_at": date(2026, 7, 22),
        "robots_checked_by": "tester",
        "robots_checked_at": date(2026, 7, 22),
        "robots_allowed": True,
        "user_agent": "CollectorTest/1.0",
        "request_interval_seconds": 1.0,
        "max_response_bytes": 100_000,
        "max_redirects": 2,
        "timeout": TimeoutPolicy(1, 1, 1, 1),
        "retry": RetryPolicy(3, 0.1, 1),
    }
    values.update(overrides)
    return SourcePolicy(**values)  # type: ignore[arg-type]
