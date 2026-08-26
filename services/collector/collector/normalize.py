from __future__ import annotations

import hashlib
import json
import re
from typing import Any

from collector.models import ExtractedRecord, NormalizedRecord

_WHITESPACE = re.compile(r"\s+")
_EMAIL_PATTERN = re.compile(
    r"^[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@"
    r"[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?"
    r"(?:\.[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?)+$",
    re.IGNORECASE,
)
_GENERIC_BUSINESS_EMAIL_LOCALS = frozenset(
    {
        "admin",
        "biz",
        "business",
        "contact",
        "cs",
        "help",
        "hello",
        "info",
        "inquiry",
        "mail",
        "master",
        "office",
        "support",
    }
)


def normalize_text(value: object) -> str | None:
    if not isinstance(value, str):
        return None
    normalized = _WHITESPACE.sub(" ", value).strip()
    return normalized or None


def normalize_phone(value: object) -> tuple[str | None, str | None]:
    display = normalize_text(value)
    if display is None:
        return None, None

    digits = re.sub(r"\D", "", display)
    if digits.startswith("82") and len(digits) >= 10:
        digits = f"0{digits[2:]}"
    if not 9 <= len(digits) <= 11 or not digits.startswith("0"):
        return None, display
    return digits, display


def normalize_email(
    value: object,
) -> tuple[str | None, str | None, str | None]:
    display = normalize_text(value)
    if display is None:
        return None, None, None
    if display.lower().startswith("mailto:"):
        display = display[7:].strip()
    display = display.split("?", 1)[0].strip()
    if len(display) > 254 or not _EMAIL_PATTERN.fullmatch(display):
        return None, display, None
    local, domain = display.rsplit("@", 1)
    normalized = f"{local.lower()}@{domain.lower()}"
    kind = (
        "generic_business"
        if local.lower() in _GENERIC_BUSINESS_EMAIL_LOCALS
        else "unknown"
    )
    return normalized, display, kind


def normalize_address(value: object) -> str | None:
    if isinstance(value, str):
        return normalize_text(value)
    if not isinstance(value, dict):
        return None

    postal_code = normalize_text(value.get("postalCode"))
    address_parts = [
        part
        for key in ("addressRegion", "addressLocality", "streetAddress")
        if (part := normalize_text(value.get(key)))
    ]
    parts = [postal_code] if postal_code else []
    for index, part in enumerate(address_parts):
        if any(part in later_part for later_part in address_parts[index + 1 :]):
            continue
        if part not in parts:
            parts.append(part)
    return " ".join(parts) or None


def canonical_hash(values: dict[str, Any]) -> str:
    encoded = json.dumps(
        values,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def normalize_record(record: ExtractedRecord) -> NormalizedRecord:
    extracted = record.extracted_values
    phone_normalized, phone_display = normalize_phone(extracted.get("telephone"))
    email_normalized, email_display, email_kind = normalize_email(
        extracted.get("email")
    )
    values = {
        "name": normalize_text(extracted.get("name")),
        "phoneNormalized": phone_normalized,
        "phoneDisplay": phone_display,
        "emailNormalized": email_normalized,
        "emailDisplay": email_display if email_normalized else None,
        "emailKind": email_kind,
        "addressText": normalize_address(extracted.get("address")),
        "summary": normalize_text(extracted.get("description")),
    }
    normalized_values = {key: value for key, value in values.items() if value is not None}
    return NormalizedRecord(
        source_url=record.source_url,
        source_record_key=record.source_record_key,
        extracted_values=record.extracted_values,
        normalized_values=normalized_values,
        content_hash=canonical_hash(normalized_values),
    )


def is_viable_candidate(record: NormalizedRecord) -> bool:
    values = record.normalized_values
    return bool(values.get("name")) and bool(
        values.get("phoneNormalized") or values.get("addressText")
    )
