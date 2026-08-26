from __future__ import annotations

import tomllib
from datetime import date
from pathlib import Path
from typing import Any

from collector.models import RetryPolicy, SourcePolicy, TimeoutPolicy

SUPPORTED_FIELDS = frozenset(
    {"name", "telephone", "email", "address", "description"}
)
SUPPORTED_ADAPTERS = frozenset({"jsonld_local_business"})


class ConfigError(ValueError):
    """Raised when a source policy is missing a safety requirement."""


def _required(mapping: dict[str, Any], key: str, expected: type[Any]) -> Any:
    value = mapping.get(key)
    if not isinstance(value, expected):
        raise ConfigError(f"invalid_or_missing_{key}")
    return value


def _required_text(mapping: dict[str, Any], key: str) -> str:
    value = _required(mapping, key, str).strip()
    if not value:
        raise ConfigError(f"invalid_or_missing_{key}")
    return value


def _positive_number(mapping: dict[str, Any], key: str) -> float:
    value = mapping.get(key)
    if not isinstance(value, int | float) or isinstance(value, bool) or value <= 0:
        raise ConfigError(f"invalid_or_missing_{key}")
    return float(value)


def _string_tuple(mapping: dict[str, Any], key: str) -> tuple[str, ...]:
    value = mapping.get(key)
    if (
        not isinstance(value, list)
        or not value
        or any(not isinstance(item, str) or not item.strip() for item in value)
    ):
        raise ConfigError(f"invalid_or_missing_{key}")
    return tuple(item.strip() for item in value)


def _parse_date(mapping: dict[str, Any], key: str) -> date:
    value = mapping.get(key)
    if isinstance(value, date):
        return value
    if isinstance(value, str):
        try:
            return date.fromisoformat(value)
        except ValueError as exc:
            raise ConfigError(f"invalid_{key}") from exc
    raise ConfigError(f"invalid_or_missing_{key}")


def _parse_source(raw: dict[str, Any]) -> SourcePolicy:
    adapter = _required(raw, "adapter", str)
    if adapter not in SUPPORTED_ADAPTERS:
        raise ConfigError("unsupported_adapter")

    allowed_fields = frozenset(_string_tuple(raw, "allowed_fields"))
    if not allowed_fields <= SUPPORTED_FIELDS:
        raise ConfigError("unsupported_allowed_field")

    robots_allowed = raw.get("robots_allowed")
    if robots_allowed is not True:
        raise ConfigError("robots_not_approved")

    timeout_raw = _required(raw, "timeout", dict)
    retry_raw = _required(raw, "retry", dict)
    max_attempts = retry_raw.get("max_attempts")
    max_redirects = raw.get("max_redirects")
    max_response_bytes = raw.get("max_response_bytes")
    if (
        not isinstance(max_attempts, int)
        or isinstance(max_attempts, bool)
        or max_attempts < 1
        or max_attempts > 5
    ):
        raise ConfigError("invalid_max_attempts")
    if (
        not isinstance(max_redirects, int)
        or isinstance(max_redirects, bool)
        or not 0 <= max_redirects <= 5
    ):
        raise ConfigError("invalid_max_redirects")
    if (
        not isinstance(max_response_bytes, int)
        or isinstance(max_response_bytes, bool)
        or not 1024 <= max_response_bytes <= 5_000_000
    ):
        raise ConfigError("invalid_max_response_bytes")

    initial_backoff = _positive_number(retry_raw, "initial_backoff_seconds")
    max_backoff = _positive_number(retry_raw, "max_backoff_seconds")
    if initial_backoff > max_backoff:
        raise ConfigError("initial_backoff_exceeds_maximum")

    return SourcePolicy(
        name=_required_text(raw, "name"),
        adapter=adapter,
        extractor_version=_required_text(raw, "extractor_version"),
        start_urls=_string_tuple(raw, "start_urls"),
        allowed_hosts=tuple(host.lower() for host in _string_tuple(raw, "allowed_hosts")),
        allowed_path_prefixes=_string_tuple(raw, "allowed_path_prefixes"),
        allowed_fields=allowed_fields,
        allowed_schema_types=frozenset(_string_tuple(raw, "allowed_schema_types")),
        policy_checked_by=_required_text(raw, "policy_checked_by"),
        policy_checked_at=_parse_date(raw, "policy_checked_at"),
        robots_checked_by=_required_text(raw, "robots_checked_by"),
        robots_checked_at=_parse_date(raw, "robots_checked_at"),
        robots_allowed=robots_allowed,
        user_agent=_required_text(raw, "user_agent"),
        request_interval_seconds=_positive_number(raw, "request_interval_seconds"),
        max_response_bytes=max_response_bytes,
        max_redirects=max_redirects,
        timeout=TimeoutPolicy(
            connect_seconds=_positive_number(timeout_raw, "connect_seconds"),
            read_seconds=_positive_number(timeout_raw, "read_seconds"),
            write_seconds=_positive_number(timeout_raw, "write_seconds"),
            pool_seconds=_positive_number(timeout_raw, "pool_seconds"),
        ),
        retry=RetryPolicy(
            max_attempts=max_attempts,
            initial_backoff_seconds=initial_backoff,
            max_backoff_seconds=max_backoff,
        ),
    )


def load_source_policies(path: Path) -> dict[str, SourcePolicy]:
    with path.open("rb") as source_file:
        document = tomllib.load(source_file)

    raw_sources = document.get("sources")
    if not isinstance(raw_sources, list) or not raw_sources:
        raise ConfigError("missing_sources")

    policies: dict[str, SourcePolicy] = {}
    for raw_source in raw_sources:
        if not isinstance(raw_source, dict):
            raise ConfigError("invalid_source")
        policy = _parse_source(raw_source)
        if not policy.name or policy.name in policies:
            raise ConfigError("blank_or_duplicate_source_name")
        policies[policy.name] = policy

    return policies
