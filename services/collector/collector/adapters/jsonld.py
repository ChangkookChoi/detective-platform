from __future__ import annotations

import json
from html.parser import HTMLParser
from typing import Any

from collector.models import ExtractedRecord, SourcePolicy


class AdapterError(ValueError):
    """Raised for invalid or unsupported source documents."""


class _JsonLdScriptParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self._inside_jsonld = False
        self._parts: list[str] = []
        self.documents: list[str] = []

    def handle_starttag(
        self, tag: str, attrs: list[tuple[str, str | None]]
    ) -> None:
        if tag.lower() != "script":
            return
        attributes = {key.lower(): value for key, value in attrs}
        if (attributes.get("type") or "").lower() == "application/ld+json":
            self._inside_jsonld = True
            self._parts = []

    def handle_data(self, data: str) -> None:
        if self._inside_jsonld:
            self._parts.append(data)

    def handle_endtag(self, tag: str) -> None:
        if tag.lower() == "script" and self._inside_jsonld:
            self.documents.append("".join(self._parts))
            self._inside_jsonld = False
            self._parts = []


def _walk_nodes(value: Any) -> list[dict[str, Any]]:
    if isinstance(value, list):
        nodes: list[dict[str, Any]] = []
        for item in value:
            nodes.extend(_walk_nodes(item))
        return nodes
    if not isinstance(value, dict):
        return []
    graph = value.get("@graph")
    if isinstance(graph, list):
        return [value, *_walk_nodes(graph)]
    return [value]


def _schema_types(node: dict[str, Any]) -> set[str]:
    raw_types = node.get("@type")
    if isinstance(raw_types, str):
        return {raw_types}
    if isinstance(raw_types, list):
        return {item for item in raw_types if isinstance(item, str)}
    return set()


def _extract_field(field: str, value: object) -> str | dict[str, str] | None:
    if isinstance(value, str):
        limits = {
            "name": 500,
            "telephone": 100,
            "email": 254,
            "address": 2_000,
            "description": 10_000,
        }
        return value[: limits[field]]
    if field != "address" or not isinstance(value, dict):
        return None
    allowed_address_keys = (
        "postalCode",
        "addressRegion",
        "addressLocality",
        "streetAddress",
    )
    return {
        key: raw_value[:1_000]
        for key in allowed_address_keys
        if isinstance((raw_value := value.get(key)), str)
    }


class JsonLdLocalBusinessAdapter:
    name = "jsonld_local_business"

    def extract(
        self, html: bytes, source_url: str, policy: SourcePolicy
    ) -> list[ExtractedRecord]:
        parser = _JsonLdScriptParser()
        try:
            parser.feed(html.decode("utf-8"))
        except (UnicodeDecodeError, ValueError) as exc:
            raise AdapterError("invalid_html_encoding") from exc

        records: list[ExtractedRecord] = []
        sequence = 0
        for document in parser.documents:
            try:
                decoded = json.loads(document)
            except json.JSONDecodeError:
                continue
            for node in _walk_nodes(decoded):
                if not (_schema_types(node) & policy.allowed_schema_types):
                    continue
                sequence += 1
                values = {}
                for field in policy.allowed_fields:
                    extracted = _extract_field(field, node.get(field))
                    if extracted is not None:
                        values[field] = extracted
                raw_key = node.get("@id")
                source_key = (
                    raw_key.strip()[:2_048]
                    if isinstance(raw_key, str) and raw_key.strip()
                    else f"{source_url}#jsonld-{sequence}"
                )
                records.append(
                    ExtractedRecord(
                        source_url=source_url,
                        source_record_key=source_key,
                        extracted_values=values,
                    )
                )
        return records
