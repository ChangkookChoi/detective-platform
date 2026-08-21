from __future__ import annotations

import hashlib
import html
import json
import re
import tempfile
from collections import Counter
from collections.abc import Callable
from dataclasses import asdict, dataclass
from datetime import date, datetime, timedelta, timezone
from html.parser import HTMLParser
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit, urlunsplit

import psycopg

from collector.candidate_batch import (
    CandidateBatchError,
    NetworkCheck,
    RegistryEntry,
    check_source_network,
    normalize_address_key,
    normalize_source_url,
)
from collector.adapters.jsonld import AdapterError, JsonLdLocalBusinessAdapter
from collector.http_client import CollectorHttpError, PolicyHttpClient
from collector.models import NormalizedRecord, RetryPolicy, SourcePolicy, TimeoutPolicy
from collector.naver_api_hub import NaverApiHubClient
from collector.normalize import normalize_email, normalize_phone, normalize_record


_HTML_TAG_PATTERN = re.compile(r"<[^>]+>")
_WHITESPACE_PATTERN = re.compile(r"\s+")
_RELEVANT_TERMS = ("탐정", "흥신", "민간조사")
_STRONG_OFFICE_NAME_PATTERN = re.compile(
    r"탐정\s*(?:사무소|법인|연구소|센터|업체|그룹)|"
    r"(?:공인|사설)\s*탐정|민간\s*조사|흥신소",
    re.IGNORECASE,
)
_NEGATIVE_CONTEXT_PATTERN = re.compile(
    r"명탐정|코난|추리|팝업|게임|카페|전시|애니|만화|방탈출|"
    r"보드게임|동물|반려|펫|보육원|레미콘|콘크리트|행정사|"
    r"법무사|세무사|공인중개|부동산|학원|서점|박물관|키즈",
    re.IGNORECASE,
)
_SERVICE_EVIDENCE_PATTERNS = (
    ("DETECTIVE_SERVICE", re.compile(r"탐정\s*(?:업무|서비스|의뢰|상담)")),
    ("PRIVATE_INVESTIGATION", re.compile(r"민간\s*조사")),
    ("FACT_INVESTIGATION", re.compile(r"사실\s*조사")),
    ("EVIDENCE_COLLECTION", re.compile(r"증거\s*(?:수집|확보)")),
    ("AFFAIR_INVESTIGATION", re.compile(r"(?:외도|불륜)\s*(?:조사|증거)")),
    ("PERSON_SEARCH", re.compile(r"(?:사람|실종인|가출인)\s*찾기")),
    ("CORPORATE_INVESTIGATION", re.compile(r"기업\s*조사")),
    ("BACKGROUND_INVESTIGATION", re.compile(r"신원\s*조사")),
)
_SEO_OR_DIRECTORY_HOSTS = (
    "blog.naver.com",
    "cafe.naver.com",
    "m.blog.naver.com",
    "youtube.com",
    "www.youtube.com",
    "facebook.com",
    "www.facebook.com",
    "instagram.com",
    "www.instagram.com",
)
_NON_OFFICIAL_HOST_SUFFIXES = (
    "naver.com",
    "daum.net",
    "kakao.com",
    "tistory.com",
    "blogspot.com",
    "wordpress.com",
    "notion.site",
)
_TARGET_ADDRESS_PREFIXES = ("서울", "서울특별시", "경기", "경기도")
_LEGACY_RAW_FIELDS = {"description", "telephone", "mapx", "mapy"}
_HTML_CHARSET_PATTERN = re.compile(
    br"charset\s*=\s*[\"']?([a-zA-Z0-9_-]+)", re.IGNORECASE
)
_VISIBLE_PHONE_PATTERN = re.compile(
    r"(?<!\d)(0\d{1,2})[\s().-]*(\d{3,4})[\s.-]*(\d{4})(?!\d)"
)
_VISIBLE_EMAIL_PATTERN = re.compile(
    r"(?<![A-Z0-9.!#$%&'*+/=?^_`{|}~-])"
    r"[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@"
    r"[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?"
    r"(?:\.[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?)+",
    re.IGNORECASE,
)


class OfficeDiscoveryError(RuntimeError):
    pass


@dataclass(frozen=True)
class DiscoveryQuery:
    region: str
    keyword: str
    text: str


@dataclass(frozen=True)
class RawOfficeDiscoveryRecord:
    version: int
    record_id: str
    run_id: str
    provider: str
    endpoint: str
    query: str
    position: int
    fetched_at: str
    expires_at: str
    title: str
    link: str
    category: str
    address: str
    road_address: str


@dataclass(frozen=True)
class FilteredOfficeDiscoveryRecord:
    version: int
    rules_version: str
    record_id: str
    run_id: str
    status: str
    reason_codes: tuple[str, ...]
    source_verification: str
    promotion_allowed: bool
    normalized_name: str
    normalized_address: str
    normalized_url: str
    host: str


@dataclass(frozen=True)
class DiscoverySummary:
    run_id: str
    query_count: int
    request_count: int
    raw_count: int
    source_check_required_count: int
    needs_review_count: int
    rejected_count: int
    purged_run_count: int
    purged_file_count: int
    reason_counts: dict[str, int]
    raw_output: str
    filtered_output: str
    expires_at: str


@dataclass(frozen=True)
class DiscoveryPurgeSummary:
    scanned_run_count: int
    deleted_run_count: int
    deleted_file_count: int


@dataclass(frozen=True)
class RawWebSourceRecord:
    version: int
    record_id: str
    run_id: str
    parent_record_id: str
    provider: str
    endpoint: str
    position: int
    fetched_at: str
    expires_at: str
    title: str
    link: str


@dataclass(frozen=True)
class FilteredWebSourceRecord:
    version: int
    rules_version: str
    record_id: str
    run_id: str
    parent_record_id: str
    status: str
    reason_codes: tuple[str, ...]
    source_verification: str
    promotion_allowed: bool
    normalized_url: str
    host: str


@dataclass(frozen=True)
class WebSourceDiscoverySummary:
    run_id: str
    candidate_count: int
    previously_processed_count: int
    request_count: int
    raw_count: int
    source_check_required_count: int
    needs_review_count: int
    rejected_count: int
    reason_counts: dict[str, int]
    raw_output: str
    filtered_output: str
    manifest_output: str
    expires_at: str


@dataclass(frozen=True)
class WebSourceProbeRecord:
    version: int
    rules_version: str
    record_id: str
    run_id: str
    parent_record_id: str
    status: str
    reason_code: str | None
    robots_status: int | None
    source_status: int | None
    final_url: str | None
    content_bytes: int
    source_verification: str
    promotion_allowed: bool
    checked_at: str
    expires_at: str


@dataclass(frozen=True)
class WebSourceProbeSummary:
    run_id: str
    candidate_count: int
    content_check_required_count: int
    needs_review_count: int
    blocked_count: int
    deferred_count: int
    reason_counts: dict[str, int]
    output: str
    expires_at: str


@dataclass(frozen=True)
class OfficialSourceFactRecord:
    version: int
    rules_version: str
    record_id: str
    run_id: str
    parent_record_id: str
    source_url: str
    status: str
    reason_code: str | None
    extracted_name: str | None
    phone_normalized: str | None
    phone_display: str | None
    address_text: str | None
    name_match: bool
    address_match: bool
    region_match: bool
    source_verification: str
    promotion_allowed: bool
    checked_at: str
    expires_at: str
    business_service_match: bool = False
    business_service_reason_codes: tuple[str, ...] = ()
    email_normalized: str | None = None
    email_display: str | None = None
    email_kind: str | None = None


@dataclass(frozen=True)
class OfficialSourceFactSummary:
    run_id: str
    candidate_count: int
    structured_record_count: int
    strong_match_count: int
    partial_match_count: int
    insufficient_count: int
    failed_count: int
    business_service_match_count: int
    reason_counts: dict[str, int]
    output: str
    expires_at: str


@dataclass(frozen=True)
class DiscoveryReviewRecord:
    version: int
    rules_version: str
    candidate_id: str
    candidate_name: str
    candidate_address: str
    phone_normalized: str | None
    phone_display: str | None
    email_normalized: str | None
    email_display: str | None
    email_kind: str | None
    source_url: str
    evidence_status: str
    business_relevance: str
    relevance_reason_codes: tuple[str, ...]
    business_service_match: bool
    name_match: bool
    address_match: bool
    region_match: bool
    evidence_run_id: str
    checked_at: str
    expires_at: str
    review_status: str
    promotion_allowed: bool


@dataclass(frozen=True)
class DiscoveryReviewSummary:
    fact_count: int
    eligible_fact_count: int
    candidate_count: int
    strong_match_count: int
    partial_match_count: int
    research_count: int
    excluded_count: int
    duplicate_count: int
    missing_parent_count: int
    reason_counts: dict[str, int]
    output: str
    research_output: str
    expires_at: str


@dataclass(frozen=True)
class BusinessRelevanceAssessment:
    status: str
    reason_codes: tuple[str, ...]


@dataclass(frozen=True)
class DiscoveryResearchRecord:
    version: int
    rules_version: str
    candidate_id: str
    candidate_name: str
    candidate_address: str
    phone_normalized: str | None
    phone_display: str | None
    email_normalized: str | None
    email_display: str | None
    email_kind: str | None
    source_url: str
    evidence_status: str
    business_relevance: str
    relevance_reason_codes: tuple[str, ...]
    business_service_match: bool
    research_reason_codes: tuple[str, ...]
    evidence_run_id: str
    checked_at: str
    expires_at: str
    review_status: str
    promotion_allowed: bool


@dataclass(frozen=True)
class OfficeEmailTarget:
    target_type: str
    target_id: str
    office_id: str | None
    source_url: str


@dataclass(frozen=True)
class OfficeEmailCandidateRecord:
    version: int
    rules_version: str
    target_type: str
    target_id: str
    office_id: str | None
    source_url: str
    email_normalized: str | None
    email_display: str | None
    email_kind: str | None
    status: str
    reason_code: str | None
    checked_at: str
    expires_at: str
    marketing_consent_status: str
    promotion_allowed: bool


@dataclass(frozen=True)
class OfficeEmailCandidateSummary:
    target_count: int
    checked_count: int
    email_candidate_count: int
    generic_business_count: int
    unknown_count: int
    no_email_count: int
    failed_count: int
    reason_counts: dict[str, int]
    output: str
    expires_at: str


def build_query_plan(
    regions: list[str], keywords: list[str], *, max_queries: int
) -> tuple[DiscoveryQuery, ...]:
    if not 1 <= max_queries <= 100:
        raise OfficeDiscoveryError("discovery_query_budget_invalid")
    normalized_regions = tuple(
        dict.fromkeys(" ".join(region.split()) for region in regions if region.strip())
    )
    normalized_keywords = tuple(
        dict.fromkeys(" ".join(keyword.split()) for keyword in keywords if keyword.strip())
    )
    if not normalized_regions or not normalized_keywords:
        raise OfficeDiscoveryError("discovery_regions_and_keywords_required")
    plan = tuple(
        DiscoveryQuery(region=region, keyword=keyword, text=f"{region} {keyword}")
        for region in normalized_regions
        for keyword in normalized_keywords
    )
    if len(plan) > max_queries:
        raise OfficeDiscoveryError("discovery_query_budget_exceeded")
    return plan


def normalize_result_text(value: str) -> str:
    without_tags = _HTML_TAG_PATTERN.sub("", value)
    return _WHITESPACE_PATTERN.sub(" ", html.unescape(without_tags)).strip()


def normalize_discovery_url(value: str) -> str:
    normalized = value.strip()
    if not normalized:
        return ""
    parts = urlsplit(normalized)
    if parts.scheme not in {"http", "https"} or not parts.hostname:
        return ""
    scheme = "https" if parts.scheme == "https" else "http"
    return urlunsplit((scheme, parts.netloc.lower(), parts.path or "/", parts.query, ""))


def _record_id(query: str, position: int, item: dict[str, str]) -> str:
    material = json.dumps(
        {
            "query": query,
            "position": position,
            "title": item.get("title", ""),
            "link": item.get("link", ""),
            "address": item.get("address", ""),
            "roadAddress": item.get("roadAddress", ""),
        },
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    )
    return hashlib.sha256(material.encode("utf-8")).hexdigest()


def _identity(record: RawOfficeDiscoveryRecord) -> str:
    name = normalize_result_text(record.title).lower()
    address = normalize_address_key(record.road_address or record.address)
    link = normalize_discovery_url(record.link)
    if name and address:
        return "name-address|" + "|".join((name, address))
    return "fallback|" + "|".join((name, address, link))


def _identity_hash(record: RawOfficeDiscoveryRecord) -> str:
    return hashlib.sha256(_identity(record).encode("utf-8")).hexdigest()


def _registered_source_match(
    link: str, registry: dict[str, RegistryEntry]
) -> bool:
    host = _canonical_host(link)
    registry_hosts = {
        _canonical_host(f"https://{entry.host}") for entry in registry.values()
    }
    return bool(host and host in registry_hosts)


def _canonical_host(value: str) -> str:
    host = (urlsplit(value).hostname or "").lower().rstrip(".")
    if host.startswith("www."):
        host = host[4:]
    return host


def _is_non_official_host(host: str) -> bool:
    canonical = host.lower().rstrip(".")
    return canonical in _SEO_OR_DIRECTORY_HOSTS or any(
        canonical == suffix or canonical.endswith(f".{suffix}")
        for suffix in _NON_OFFICIAL_HOST_SUFFIXES
    )


def assess_business_relevance(
    name: str, category: str
) -> BusinessRelevanceAssessment:
    normalized_name = normalize_result_text(name)
    normalized_category = normalize_result_text(category)
    strong_name = bool(_STRONG_OFFICE_NAME_PATTERN.search(normalized_name))
    category_match = any(
        term in normalized_category for term in _RELEVANT_TERMS
    )
    generic_name_match = any(
        term in normalized_name for term in _RELEVANT_TERMS
    )
    negative_context = bool(
        _NEGATIVE_CONTEXT_PATTERN.search(
            f"{normalized_name} {normalized_category}"
        )
    )
    reasons: list[str] = []
    if strong_name:
        reasons.append("STRONG_OFFICE_NAME")
    if category_match:
        reasons.append("RELEVANT_CATEGORY")
    if generic_name_match and not strong_name:
        reasons.append("GENERIC_DETECTIVE_TERM")
    if negative_context:
        reasons.append("NEGATIVE_CONTEXT")

    if strong_name and (category_match or not negative_context):
        status = "probable"
    elif category_match and not negative_context:
        status = "probable"
    elif negative_context and not (strong_name or category_match):
        status = "irrelevant"
        reasons.append("NO_DETECTIVE_BUSINESS_SIGNAL")
    elif strong_name or category_match or generic_name_match:
        status = "ambiguous"
    else:
        status = "irrelevant"
        reasons.append("NO_DETECTIVE_BUSINESS_SIGNAL")
    return BusinessRelevanceAssessment(
        status=status,
        reason_codes=tuple(dict.fromkeys(reasons)),
    )


def filter_discovery_record(
    record: RawOfficeDiscoveryRecord,
    *,
    duplicate_keys: dict[str, set[str]],
    registry: dict[str, RegistryEntry],
    seen_identities: set[str],
) -> FilteredOfficeDiscoveryRecord:
    name = normalize_result_text(record.title)
    category = normalize_result_text(record.category)
    address = normalize_result_text(record.road_address or record.address)
    normalized_address = normalize_address_key(address) if address else ""
    link = normalize_discovery_url(record.link)
    host = _canonical_host(link)
    reasons: list[str] = []
    relevance = assess_business_relevance(name, category)

    identity = _identity(record)
    if identity in seen_identities:
        reasons.append("DUPLICATE_IN_RUN")
    else:
        seen_identities.add(identity)

    if not address.startswith(_TARGET_ADDRESS_PREFIXES):
        reasons.append("OUTSIDE_TARGET_REGION")
    if relevance.status == "irrelevant":
        reasons.extend(("UNRELATED_CATEGORY", "IRRELEVANT_BUSINESS"))
    if " ".join(name.lower().split()) in duplicate_keys.get("name", set()):
        reasons.append("EXISTING_NAME")
    if normalized_address and normalized_address in duplicate_keys.get("address", set()):
        reasons.append("EXISTING_ADDRESS")
    try:
        normalized_source = normalize_source_url(link) if link else ""
    except CandidateBatchError:
        normalized_source = ""
    if normalized_source and normalized_source in duplicate_keys.get("source", set()):
        reasons.append("EXISTING_SOURCE")
    if _registered_source_match(link, registry):
        reasons.append("SOURCE_REGISTRY_MATCH")

    blocking = {
        "DUPLICATE_IN_RUN",
        "OUTSIDE_TARGET_REGION",
        "EXISTING_ADDRESS",
        "EXISTING_SOURCE",
        "SOURCE_REGISTRY_MATCH",
        "IRRELEVANT_BUSINESS",
    }
    review_reasons: list[str] = []
    if not link:
        review_reasons.append("OFFICIAL_SOURCE_REQUIRED")
    elif _is_non_official_host(host):
        review_reasons.append("NON_OFFICIAL_LINK")
    elif not link.startswith("https://"):
        review_reasons.append("HTTPS_SOURCE_REQUIRED")
    if relevance.status == "ambiguous":
        review_reasons.append("RELEVANCE_REVIEW_REQUIRED")
    if "EXISTING_NAME" in reasons and not (blocking & set(reasons)):
        review_reasons.append("POSSIBLE_BRANCH_OR_DUPLICATE_NAME")

    all_reasons = tuple(dict.fromkeys((*reasons, *review_reasons)))
    if blocking & set(all_reasons):
        status = "rejected"
    elif review_reasons:
        status = "needs_review"
    else:
        status = "source_check_required"
    return FilteredOfficeDiscoveryRecord(
        version=3,
        rules_version="office-discovery-v3",
        record_id=record.record_id,
        run_id=record.run_id,
        status=status,
        reason_codes=all_reasons,
        source_verification="required",
        promotion_allowed=False,
        normalized_name=name,
        normalized_address=address,
        normalized_url=link,
        host=host,
    )


def _write_jsonl(path: Path, records: list[Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.parent.chmod(0o700)
    temporary_path: Path | None = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="w",
            encoding="utf-8",
            dir=path.parent,
            prefix=f".{path.name}.",
            suffix=".tmp",
            delete=False,
        ) as handle:
            temporary_path = Path(handle.name)
            for record in records:
                handle.write(
                    json.dumps(asdict(record), ensure_ascii=False, sort_keys=True)
                    + "\n"
                )
        temporary_path.chmod(0o600)
        temporary_path.replace(path)
    finally:
        if temporary_path is not None and temporary_path.exists():
            temporary_path.unlink()


def _write_private_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.parent.chmod(0o700)
    temporary_path: Path | None = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="w",
            encoding="utf-8",
            dir=path.parent,
            prefix=f".{path.name}.",
            suffix=".tmp",
            delete=False,
        ) as handle:
            temporary_path = Path(handle.name)
            json.dump(payload, handle, ensure_ascii=False, sort_keys=True)
            handle.write("\n")
        temporary_path.chmod(0o600)
        temporary_path.replace(path)
    finally:
        if temporary_path is not None and temporary_path.exists():
            temporary_path.unlink()


def _parse_expiry(value: str) -> datetime:
    try:
        parsed = datetime.fromisoformat(value)
    except ValueError as exc:
        raise OfficeDiscoveryError("discovery_expiry_invalid") from exc
    if parsed.tzinfo is None:
        raise OfficeDiscoveryError("discovery_expiry_timezone_required")
    return parsed.astimezone(timezone.utc)


def _load_raw_discovery_records_unchecked(
    path: Path,
) -> tuple[RawOfficeDiscoveryRecord, ...]:
    records: list[RawOfficeDiscoveryRecord] = []
    field_names = set(RawOfficeDiscoveryRecord.__dataclass_fields__)
    for line_number, line in enumerate(
        path.read_text(encoding="utf-8").splitlines(), start=1
    ):
        if not line.strip():
            continue
        try:
            payload = json.loads(line)
            if not isinstance(payload, dict) or payload.get("version") not in {1, 2}:
                raise ValueError
            payload_keys = set(payload)
            if not field_names.issubset(payload_keys):
                raise ValueError
            if payload_keys - field_names - _LEGACY_RAW_FIELDS:
                raise ValueError
            record = RawOfficeDiscoveryRecord(
                **{key: payload[key] for key in field_names}
            )
        except (TypeError, ValueError, json.JSONDecodeError) as exc:
            raise OfficeDiscoveryError(
                f"discovery_raw_record_invalid_at_line_{line_number}"
            ) from exc
        if any(
            not isinstance(value, str)
            for key, value in asdict(record).items()
            if key not in {"version", "position"}
        ) or not isinstance(record.position, int):
            raise OfficeDiscoveryError(
                f"discovery_raw_record_invalid_at_line_{line_number}"
            )
        records.append(record)
    if not records:
        raise OfficeDiscoveryError("discovery_raw_records_empty")
    run_ids = {record.run_id for record in records}
    if len(run_ids) != 1:
        raise OfficeDiscoveryError("discovery_raw_run_id_mismatch")
    expiries = {_parse_expiry(record.expires_at) for record in records}
    if len(expiries) != 1:
        raise OfficeDiscoveryError("discovery_raw_expiry_mismatch")
    return tuple(records)


def load_raw_discovery_records(
    path: Path, *, now: datetime | None = None
) -> tuple[RawOfficeDiscoveryRecord, ...]:
    records = _load_raw_discovery_records_unchecked(path)
    current = now or datetime.now(timezone.utc)
    if current.tzinfo is None:
        raise OfficeDiscoveryError("discovery_timestamp_must_be_timezone_aware")
    expires_at = _parse_expiry(records[0].expires_at)
    if expires_at <= current.astimezone(timezone.utc):
        raise OfficeDiscoveryError("discovery_raw_records_expired")
    return records


def _load_file_expiry(path: Path) -> datetime:
    run_ids: set[str] = set()
    expiries: set[datetime] = set()
    record_count = 0
    for line_number, line in enumerate(
        path.read_text(encoding="utf-8").splitlines(), start=1
    ):
        if not line.strip():
            continue
        record_count += 1
        try:
            payload = json.loads(line)
            run_id = payload["run_id"]
            expires_at = payload["expires_at"]
            if not isinstance(run_id, str) or not isinstance(expires_at, str):
                raise ValueError
        except (KeyError, TypeError, ValueError, json.JSONDecodeError) as exc:
            raise OfficeDiscoveryError(
                f"discovery_expiry_record_invalid_at_line_{line_number}"
            ) from exc
        run_ids.add(run_id)
        expiries.add(_parse_expiry(expires_at))
    if record_count == 0:
        raise OfficeDiscoveryError("discovery_raw_records_empty")
    if len(run_ids) != 1:
        raise OfficeDiscoveryError("discovery_raw_run_id_mismatch")
    if len(expiries) != 1:
        raise OfficeDiscoveryError("discovery_raw_expiry_mismatch")
    return next(iter(expiries))


def purge_expired_discovery_files(
    output_dir: Path, *, now: datetime | None = None
) -> DiscoveryPurgeSummary:
    current = now or datetime.now(timezone.utc)
    if current.tzinfo is None:
        raise OfficeDiscoveryError("discovery_timestamp_must_be_timezone_aware")
    current = current.astimezone(timezone.utc)
    if not output_dir.exists():
        return DiscoveryPurgeSummary(0, 0, 0)

    scanned_run_count = 0
    deleted_run_count = 0
    deleted_file_count = 0
    for raw_path in sorted(output_dir.glob("naver-*.raw.jsonl")):
        scanned_run_count += 1
        expires_at = _load_file_expiry(raw_path)
        if expires_at > current:
            continue
        filtered_path = raw_path.with_name(
            raw_path.name.removesuffix(".raw.jsonl") + ".filtered.jsonl"
        )
        probe_path = raw_path.with_name(
            raw_path.name.removesuffix(".raw.jsonl") + ".probe.jsonl"
        )
        facts_path = raw_path.with_name(
            raw_path.name.removesuffix(".raw.jsonl") + ".facts.jsonl"
        )
        manifest_path = raw_path.with_name(
            raw_path.name.removesuffix(".raw.jsonl") + ".manifest.json"
        )
        for path in (raw_path, filtered_path, probe_path, facts_path, manifest_path):
            if path.exists():
                path.unlink()
                deleted_file_count += 1
        deleted_run_count += 1
    for manifest_path in sorted(output_dir.glob("naver-web-*.manifest.json")):
        raw_path = manifest_path.with_name(
            manifest_path.name.removesuffix(".manifest.json") + ".raw.jsonl"
        )
        if raw_path.exists():
            continue
        scanned_run_count += 1
        try:
            payload = json.loads(manifest_path.read_text(encoding="utf-8"))
            expires_at = payload["expires_at"]
            if not isinstance(expires_at, str):
                raise ValueError
        except (KeyError, TypeError, ValueError, json.JSONDecodeError) as exc:
            raise OfficeDiscoveryError("discovery_web_manifest_invalid") from exc
        if _parse_expiry(expires_at) > current:
            continue
        manifest_path.unlink()
        deleted_run_count += 1
        deleted_file_count += 1
    return DiscoveryPurgeSummary(
        scanned_run_count=scanned_run_count,
        deleted_run_count=deleted_run_count,
        deleted_file_count=deleted_file_count,
    )


def filter_discovery_records(
    records: tuple[RawOfficeDiscoveryRecord, ...],
    *,
    duplicate_keys: dict[str, set[str]],
    registry: dict[str, RegistryEntry],
) -> tuple[FilteredOfficeDiscoveryRecord, ...]:
    seen_identities: set[str] = set()
    return tuple(
        filter_discovery_record(
            record,
            duplicate_keys=duplicate_keys,
            registry=registry,
            seen_identities=seen_identities,
        )
        for record in records
    )


def _summarize_filtered(
    filtered_records: tuple[
        FilteredOfficeDiscoveryRecord | FilteredWebSourceRecord, ...
    ]
) -> tuple[Counter[str], Counter[str]]:
    status_counts = Counter(record.status for record in filtered_records)
    reason_counts = Counter(
        reason for record in filtered_records for reason in record.reason_codes
    )
    return status_counts, reason_counts


def refilter_naver_local_discovery(
    *,
    raw_path: Path,
    filtered_path: Path,
    duplicate_keys: dict[str, set[str]],
    registry: dict[str, RegistryEntry],
    now: datetime | None = None,
) -> DiscoverySummary:
    raw_records = load_raw_discovery_records(raw_path, now=now)
    filtered_records = filter_discovery_records(
        raw_records,
        duplicate_keys=duplicate_keys,
        registry=registry,
    )
    _write_jsonl(filtered_path, list(filtered_records))
    status_counts, reason_counts = _summarize_filtered(filtered_records)
    return DiscoverySummary(
        run_id=raw_records[0].run_id,
        query_count=len({record.query for record in raw_records}),
        request_count=0,
        raw_count=len(raw_records),
        source_check_required_count=status_counts["source_check_required"],
        needs_review_count=status_counts["needs_review"],
        rejected_count=status_counts["rejected"],
        purged_run_count=0,
        purged_file_count=0,
        reason_counts=dict(sorted(reason_counts.items())),
        raw_output=str(raw_path),
        filtered_output=str(filtered_path),
        expires_at=min(record.expires_at for record in raw_records),
    )


def run_naver_local_discovery(
    client: NaverApiHubClient,
    *,
    queries: tuple[DiscoveryQuery, ...],
    output_dir: Path,
    duplicate_keys: dict[str, set[str]],
    registry: dict[str, RegistryEntry],
    display: int = 5,
    retention_days: int = 7,
    now: datetime | None = None,
) -> DiscoverySummary:
    if not 1 <= retention_days <= 21:
        raise OfficeDiscoveryError("discovery_retention_days_invalid")
    current = now or datetime.now(timezone.utc)
    if current.tzinfo is None:
        raise OfficeDiscoveryError("discovery_timestamp_must_be_timezone_aware")
    current = current.astimezone(timezone.utc)
    purge_summary = purge_expired_discovery_files(output_dir, now=current)
    expires_at = current + timedelta(days=retention_days)
    run_id = f"naver-local-{current.strftime('%Y%m%dT%H%M%S%fZ')}"

    raw_records: list[RawOfficeDiscoveryRecord] = []
    for query in queries:
        response = client.search_local(query.text, display=display)
        for position, item in enumerate(response.items, start=1):
            raw_records.append(
                RawOfficeDiscoveryRecord(
                    version=2,
                    record_id=_record_id(query.text, position, item),
                    run_id=run_id,
                    provider="naver_api_hub",
                    endpoint=response.endpoint,
                    query=query.text,
                    position=position,
                    fetched_at=current.isoformat(),
                    expires_at=expires_at.isoformat(),
                    title=item.get("title", ""),
                    link=item.get("link", ""),
                    category=item.get("category", ""),
                    address=item.get("address", ""),
                    road_address=item.get("roadAddress", ""),
                )
            )

    filtered_records = filter_discovery_records(
        tuple(raw_records),
        duplicate_keys=duplicate_keys,
        registry=registry,
    )
    raw_path = output_dir / f"{run_id}.raw.jsonl"
    filtered_path = output_dir / f"{run_id}.filtered.jsonl"
    _write_jsonl(raw_path, raw_records)
    _write_jsonl(filtered_path, list(filtered_records))

    status_counts, reason_counts = _summarize_filtered(filtered_records)
    return DiscoverySummary(
        run_id=run_id,
        query_count=len(queries),
        request_count=client.request_count,
        raw_count=len(raw_records),
        source_check_required_count=status_counts["source_check_required"],
        needs_review_count=status_counts["needs_review"],
        rejected_count=status_counts["rejected"],
        purged_run_count=purge_summary.deleted_run_count,
        purged_file_count=purge_summary.deleted_file_count,
        reason_counts=dict(sorted(reason_counts.items())),
        raw_output=str(raw_path),
        filtered_output=str(filtered_path),
        expires_at=expires_at.isoformat(),
    )


def _web_record_id(
    parent_record_id: str, position: int, item: dict[str, str]
) -> str:
    material = json.dumps(
        {
            "parent_record_id": parent_record_id,
            "position": position,
            "title": item.get("title", ""),
            "link": item.get("link", ""),
        },
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    )
    return hashlib.sha256(material.encode("utf-8")).hexdigest()


def _candidate_name_terms(value: str) -> tuple[str, ...]:
    normalized = normalize_result_text(value).lower()
    for generic in ("탐정사무소", "민간조사", "흥신소", "탐정"):
        normalized = normalized.replace(generic, " ")
    return tuple(term for term in normalized.split() if len(term) >= 2)


def _web_query(record: RawOfficeDiscoveryRecord) -> str:
    name = normalize_result_text(record.title)
    address = normalize_result_text(record.road_address or record.address)
    region = " ".join(address.split()[:2])
    return " ".join(part for part in (name, region, "공식 홈페이지") if part)


def _filter_web_source_record(
    record: RawWebSourceRecord,
    *,
    parent: RawOfficeDiscoveryRecord,
    duplicate_keys: dict[str, set[str]],
    registry: dict[str, RegistryEntry],
    seen_urls: set[str],
) -> FilteredWebSourceRecord:
    link = normalize_discovery_url(record.link)
    host = _canonical_host(link)
    reasons: list[str] = []
    blocking: set[str] = set()

    if not link:
        reasons.append("OFFICIAL_SOURCE_REQUIRED")
    elif link in seen_urls:
        reasons.append("DUPLICATE_WEB_RESULT")
        blocking.add("DUPLICATE_WEB_RESULT")
    else:
        seen_urls.add(link)

    try:
        normalized_source = normalize_source_url(link) if link else ""
    except CandidateBatchError:
        normalized_source = ""
    if normalized_source and normalized_source in duplicate_keys.get("source", set()):
        reasons.append("EXISTING_SOURCE")
        blocking.add("EXISTING_SOURCE")
    if _registered_source_match(link, registry):
        reasons.append("SOURCE_REGISTRY_MATCH")
        blocking.add("SOURCE_REGISTRY_MATCH")
    if _is_non_official_host(host):
        reasons.append("NON_OFFICIAL_LINK")
    elif link and not link.startswith("https://"):
        reasons.append("HTTPS_SOURCE_REQUIRED")

    title = normalize_result_text(record.title).lower()
    name_terms = _candidate_name_terms(parent.title)
    if not name_terms:
        reasons.append("NAME_SIGNAL_REQUIRED")
    elif not any(term in title for term in name_terms):
        reasons.append("NAME_MATCH_REVIEW_REQUIRED")

    if blocking:
        status = "rejected"
    elif reasons:
        status = "needs_review"
    else:
        status = "source_check_required"
    return FilteredWebSourceRecord(
        version=2,
        rules_version="office-web-source-v2",
        record_id=record.record_id,
        run_id=record.run_id,
        parent_record_id=record.parent_record_id,
        status=status,
        reason_codes=tuple(dict.fromkeys(reasons)),
        source_verification="required",
        promotion_allowed=False,
        normalized_url=link,
        host=host,
    )


def _load_processed_web_history(
    output_dir: Path, *, now: datetime
) -> tuple[set[str], set[str]]:
    parent_ids: set[str] = set()
    identity_hashes: set[str] = set()
    manifest_run_ids: set[str] = set()
    local_identity_by_record_id: dict[str, str] = {}
    for path in sorted(output_dir.glob("naver-local-*.raw.jsonl")):
        if _load_file_expiry(path) <= now:
            continue
        for record in load_raw_discovery_records(path, now=now):
            local_identity_by_record_id[record.record_id] = _identity_hash(record)
    for path in sorted(output_dir.glob("naver-web-*.manifest.json")):
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
            run_id = payload["run_id"]
            expires_at = payload["expires_at"]
            raw_parent_ids = payload["parent_record_ids"]
            raw_identity_hashes = payload.get("candidate_identity_hashes", [])
            if (
                payload.get("version") != 1
                or not isinstance(run_id, str)
                or not isinstance(expires_at, str)
                or not isinstance(raw_parent_ids, list)
                or any(not isinstance(value, str) for value in raw_parent_ids)
                or not isinstance(raw_identity_hashes, list)
                or any(not isinstance(value, str) for value in raw_identity_hashes)
            ):
                raise ValueError
        except (KeyError, TypeError, ValueError, json.JSONDecodeError) as exc:
            raise OfficeDiscoveryError("discovery_web_manifest_invalid") from exc
        if _parse_expiry(expires_at) <= now:
            continue
        manifest_run_ids.add(run_id)
        parent_ids.update(raw_parent_ids)
        identity_hashes.update(raw_identity_hashes)
        identity_hashes.update(
            local_identity_by_record_id[parent_id]
            for parent_id in raw_parent_ids
            if parent_id in local_identity_by_record_id
        )
    for path in sorted(output_dir.glob("naver-web-*.raw.jsonl")):
        if _load_file_expiry(path) <= now:
            continue
        run_id_from_name = path.name.removesuffix(".raw.jsonl")
        if run_id_from_name in manifest_run_ids:
            continue
        for line_number, line in enumerate(
            path.read_text(encoding="utf-8").splitlines(), start=1
        ):
            try:
                payload = json.loads(line)
                parent_record_id = payload["parent_record_id"]
                if not isinstance(parent_record_id, str) or not parent_record_id:
                    raise ValueError
            except (KeyError, TypeError, ValueError, json.JSONDecodeError) as exc:
                raise OfficeDiscoveryError(
                    f"discovery_web_history_invalid_at_line_{line_number}"
                ) from exc
            parent_ids.add(parent_record_id)
            identity_hash = local_identity_by_record_id.get(parent_record_id)
            if identity_hash:
                identity_hashes.add(identity_hash)
    return parent_ids, identity_hashes


def run_naver_web_source_discovery(
    client: NaverApiHubClient,
    *,
    local_raw_path: Path,
    output_dir: Path,
    duplicate_keys: dict[str, set[str]],
    registry: dict[str, RegistryEntry],
    max_candidates: int,
    display: int = 5,
    retention_days: int = 7,
    now: datetime | None = None,
) -> WebSourceDiscoverySummary:
    if not 1 <= max_candidates <= 100:
        raise OfficeDiscoveryError("discovery_web_candidate_budget_invalid")
    if not 1 <= retention_days <= 21:
        raise OfficeDiscoveryError("discovery_retention_days_invalid")
    current = now or datetime.now(timezone.utc)
    if current.tzinfo is None:
        raise OfficeDiscoveryError("discovery_timestamp_must_be_timezone_aware")
    current = current.astimezone(timezone.utc)
    purge_expired_discovery_files(output_dir, now=current)
    processed_parent_ids, processed_identity_hashes = _load_processed_web_history(
        output_dir, now=current
    )

    local_records = load_raw_discovery_records(local_raw_path, now=current)
    local_filtered = filter_discovery_records(
        local_records,
        duplicate_keys=duplicate_keys,
        registry=registry,
    )
    source_reasons = {
        "OFFICIAL_SOURCE_REQUIRED",
        "NON_OFFICIAL_LINK",
        "HTTPS_SOURCE_REQUIRED",
    }
    selected: list[RawOfficeDiscoveryRecord] = []
    seen_candidates: set[str] = set()
    for record, filtered in zip(local_records, local_filtered, strict=True):
        identity_hash = _identity_hash(record)
        if (
            record.record_id in processed_parent_ids
            or identity_hash in processed_identity_hashes
        ):
            continue
        if filtered.status == "rejected" or not (
            source_reasons & set(filtered.reason_codes)
        ):
            continue
        if assess_business_relevance(record.title, record.category).status != "probable":
            continue
        identity = _identity(record)
        if identity in seen_candidates:
            continue
        seen_candidates.add(identity)
        selected.append(record)
        if len(selected) == max_candidates:
            break
    if not selected:
        raise OfficeDiscoveryError("discovery_web_candidates_empty")

    parent_expiry = _parse_expiry(local_records[0].expires_at)
    expires_at = min(current + timedelta(days=retention_days), parent_expiry)
    run_id = f"naver-web-{current.strftime('%Y%m%dT%H%M%S%fZ')}"
    raw_records: list[RawWebSourceRecord] = []
    for parent in selected:
        response = client.search_web(_web_query(parent), display=display)
        for position, item in enumerate(response.items, start=1):
            raw_records.append(
                RawWebSourceRecord(
                    version=1,
                    record_id=_web_record_id(parent.record_id, position, item),
                    run_id=run_id,
                    parent_record_id=parent.record_id,
                    provider="naver_api_hub",
                    endpoint=response.endpoint,
                    position=position,
                    fetched_at=current.isoformat(),
                    expires_at=expires_at.isoformat(),
                    title=item.get("title", ""),
                    link=item.get("link", ""),
                )
            )
    manifest_path = output_dir / f"{run_id}.manifest.json"
    _write_private_json(
        manifest_path,
        {
            "version": 1,
            "run_id": run_id,
            "parent_record_ids": [record.record_id for record in selected],
            "candidate_identity_hashes": [
                _identity_hash(record) for record in selected
            ],
            "expires_at": expires_at.isoformat(),
        },
    )
    if not raw_records:
        raise OfficeDiscoveryError("discovery_web_results_empty")

    parents = {record.record_id: record for record in selected}
    seen_urls: set[str] = set()
    filtered_records = tuple(
        _filter_web_source_record(
            record,
            parent=parents[record.parent_record_id],
            duplicate_keys=duplicate_keys,
            registry=registry,
            seen_urls=seen_urls,
        )
        for record in raw_records
    )
    raw_path = output_dir / f"{run_id}.raw.jsonl"
    filtered_path = output_dir / f"{run_id}.filtered.jsonl"
    _write_jsonl(raw_path, raw_records)
    _write_jsonl(filtered_path, list(filtered_records))

    status_counts, reason_counts = _summarize_filtered(filtered_records)
    return WebSourceDiscoverySummary(
        run_id=run_id,
        candidate_count=len(selected),
        previously_processed_count=max(
            len(processed_parent_ids), len(processed_identity_hashes)
        ),
        request_count=client.request_count,
        raw_count=len(raw_records),
        source_check_required_count=status_counts["source_check_required"],
        needs_review_count=status_counts["needs_review"],
        rejected_count=status_counts["rejected"],
        reason_counts=dict(sorted(reason_counts.items())),
        raw_output=str(raw_path),
        filtered_output=str(filtered_path),
        manifest_output=str(manifest_path),
        expires_at=expires_at.isoformat(),
    )


def _load_web_source_records(
    raw_path: Path, filtered_path: Path, *, now: datetime
) -> tuple[
    tuple[RawWebSourceRecord, ...], tuple[FilteredWebSourceRecord, ...]
]:
    if _load_file_expiry(raw_path) <= now.astimezone(timezone.utc):
        raise OfficeDiscoveryError("discovery_raw_records_expired")
    raw_records: list[RawWebSourceRecord] = []
    for line_number, line in enumerate(
        raw_path.read_text(encoding="utf-8").splitlines(), start=1
    ):
        try:
            payload = json.loads(line)
            raw_records.append(RawWebSourceRecord(**payload))
        except (TypeError, ValueError, json.JSONDecodeError) as exc:
            raise OfficeDiscoveryError(
                f"discovery_web_raw_invalid_at_line_{line_number}"
            ) from exc
    filtered_records: list[FilteredWebSourceRecord] = []
    for line_number, line in enumerate(
        filtered_path.read_text(encoding="utf-8").splitlines(), start=1
    ):
        try:
            payload = json.loads(line)
            payload["reason_codes"] = tuple(payload["reason_codes"])
            filtered_records.append(FilteredWebSourceRecord(**payload))
        except (KeyError, TypeError, ValueError, json.JSONDecodeError) as exc:
            raise OfficeDiscoveryError(
                f"discovery_web_filtered_invalid_at_line_{line_number}"
            ) from exc
    if not raw_records or len(raw_records) != len(filtered_records):
        raise OfficeDiscoveryError("discovery_web_record_count_mismatch")
    raw_ids = {record.record_id for record in raw_records}
    filtered_ids = {record.record_id for record in filtered_records}
    if raw_ids != filtered_ids:
        raise OfficeDiscoveryError("discovery_web_record_id_mismatch")
    return tuple(raw_records), tuple(filtered_records)


def probe_web_source_candidates(
    *,
    raw_path: Path,
    filtered_path: Path,
    output_path: Path,
    user_agent: str,
    max_sources: int = 10,
    now: datetime | None = None,
    checker: Callable[..., NetworkCheck] = check_source_network,
) -> WebSourceProbeSummary:
    if not 1 <= max_sources <= 50:
        raise OfficeDiscoveryError("discovery_probe_source_budget_invalid")
    current = now or datetime.now(timezone.utc)
    if current.tzinfo is None:
        raise OfficeDiscoveryError("discovery_timestamp_must_be_timezone_aware")
    current = current.astimezone(timezone.utc)
    raw_records, filtered_records = _load_web_source_records(
        raw_path, filtered_path, now=current
    )
    raw_by_id = {record.record_id: record for record in raw_records}
    selected = [
        record
        for record in filtered_records
        if record.status == "source_check_required"
    ][:max_sources]
    if not selected:
        raise OfficeDiscoveryError("discovery_probe_candidates_empty")

    expires_at = min(
        _parse_expiry(raw_by_id[record.record_id].expires_at)
        for record in selected
    )
    probes: list[WebSourceProbeRecord] = []
    for record in selected:
        network = checker(
            record.normalized_url,
            manual_policy_reviewed=False,
            user_agent=user_agent,
        )
        if network.status == "eligible":
            status = "content_check_required"
        elif network.status == "manual_policy_review":
            status = "needs_review"
        elif network.status == "blocked":
            status = "blocked"
        else:
            status = "deferred"
        probes.append(
            WebSourceProbeRecord(
                version=1,
                rules_version="office-source-probe-v1",
                record_id=record.record_id,
                run_id=record.run_id,
                parent_record_id=record.parent_record_id,
                status=status,
                reason_code=network.reason,
                robots_status=network.robots_status,
                source_status=network.source_status,
                final_url=network.final_url,
                content_bytes=network.content_bytes,
                source_verification="required",
                promotion_allowed=False,
                checked_at=current.isoformat(),
                expires_at=expires_at.isoformat(),
            )
        )
    _write_jsonl(output_path, probes)
    status_counts = Counter(record.status for record in probes)
    reason_counts = Counter(
        record.reason_code for record in probes if record.reason_code is not None
    )
    return WebSourceProbeSummary(
        run_id=probes[0].run_id,
        candidate_count=len(probes),
        content_check_required_count=status_counts["content_check_required"],
        needs_review_count=status_counts["needs_review"],
        blocked_count=status_counts["blocked"],
        deferred_count=status_counts["deferred"],
        reason_counts=dict(sorted(reason_counts.items())),
        output=str(output_path),
        expires_at=expires_at.isoformat(),
    )


def _load_probe_records(path: Path) -> tuple[WebSourceProbeRecord, ...]:
    records: list[WebSourceProbeRecord] = []
    for line_number, line in enumerate(
        path.read_text(encoding="utf-8").splitlines(), start=1
    ):
        try:
            records.append(WebSourceProbeRecord(**json.loads(line)))
        except (TypeError, ValueError, json.JSONDecodeError) as exc:
            raise OfficeDiscoveryError(
                f"discovery_probe_record_invalid_at_line_{line_number}"
            ) from exc
    if not records:
        raise OfficeDiscoveryError("discovery_probe_records_empty")
    if len({record.run_id for record in records}) != 1:
        raise OfficeDiscoveryError("discovery_probe_run_id_mismatch")
    return tuple(records)


def _source_policy(source_url: str, user_agent: str, checked_at: date) -> SourcePolicy:
    host = (urlsplit(source_url).hostname or "").lower()
    if not host:
        raise OfficeDiscoveryError("discovery_fact_source_host_missing")
    allowed_hosts = {host}
    if host.startswith("www."):
        allowed_hosts.add(host[4:])
    else:
        allowed_hosts.add(f"www.{host}")
    return SourcePolicy(
        name=f"discovery-{hashlib.sha256(host.encode()).hexdigest()[:12]}",
        adapter="jsonld_local_business",
        extractor_version="jsonld-v2",
        start_urls=(source_url,),
        allowed_hosts=tuple(sorted(allowed_hosts)),
        allowed_path_prefixes=("/",),
        allowed_fields=frozenset({"name", "telephone", "address"}),
        allowed_schema_types=frozenset(
            {"LocalBusiness", "ProfessionalService", "Organization"}
        ),
        policy_checked_by="automated-discovery-probe",
        policy_checked_at=checked_at,
        robots_checked_by="automated-discovery-probe",
        robots_checked_at=checked_at,
        robots_allowed=True,
        user_agent=user_agent,
        request_interval_seconds=0,
        max_response_bytes=2_500_000,
        max_redirects=3,
        timeout=TimeoutPolicy(5, 12, 5, 5),
        retry=RetryPolicy(2, 1, 4),
    )


def _fetch_official_source_html(
    source_url: str, *, user_agent: str, checked_at: date
) -> bytes:
    policy = _source_policy(source_url, user_agent, checked_at)
    with PolicyHttpClient(policy) as client:
        result = client.fetch(source_url)
    if result.body is None:
        raise OfficeDiscoveryError("discovery_fact_source_body_missing")
    return result.body


def _normalize_html_encoding(body: bytes) -> bytes:
    try:
        body.decode("utf-8")
        return body
    except UnicodeDecodeError:
        pass
    match = _HTML_CHARSET_PATTERN.search(body[:8_192])
    declared = match.group(1).decode("ascii", errors="ignore").lower() if match else ""
    encodings = {
        "euc-kr": "euc-kr",
        "euckr": "euc-kr",
        "ks_c_5601-1987": "cp949",
        "cp949": "cp949",
    }
    candidates = [encodings[declared]] if declared in encodings else ["cp949"]
    for encoding in candidates:
        try:
            return body.decode(encoding).encode("utf-8")
        except UnicodeDecodeError:
            continue
    raise OfficeDiscoveryError("discovery_fact_html_encoding_unsupported")


class _VisibleFactParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self._ignored_depth = 0
        self._parts: list[str] = []
        self.telephones: list[str] = []
        self.emails: list[str] = []

    def handle_starttag(
        self, tag: str, attrs: list[tuple[str, str | None]]
    ) -> None:
        lowered = tag.lower()
        if lowered in {"script", "style", "noscript"}:
            self._ignored_depth += 1
        if lowered == "a":
            attributes = {key.lower(): value for key, value in attrs}
            href = attributes.get("href") or ""
            if href.lower().startswith("tel:"):
                self.telephones.append(href[4:500])
            elif href.lower().startswith("mailto:"):
                self.emails.append(href[7:500])

    def handle_endtag(self, tag: str) -> None:
        if tag.lower() in {"script", "style", "noscript"} and self._ignored_depth:
            self._ignored_depth -= 1

    def handle_data(self, data: str) -> None:
        if self._ignored_depth == 0 and sum(map(len, self._parts)) < 500_000:
            self._parts.append(data[:10_000])

    @property
    def visible_text(self) -> str:
        return normalize_result_text(" ".join(self._parts))


def extract_official_business_emails(
    body: bytes, *, source_url: str, user_agent: str, checked_at: date
) -> tuple[tuple[str, str, str], ...]:
    normalized_body = _normalize_html_encoding(body)
    policy = _source_policy(source_url, user_agent, checked_at)
    adapter = JsonLdLocalBusinessAdapter()
    candidates: list[tuple[str, str, str]] = []
    for record in adapter.extract(normalized_body, source_url, policy):
        values = normalize_record(record).normalized_values
        normalized = values.get("emailNormalized")
        display = values.get("emailDisplay")
        kind = values.get("emailKind")
        if all(isinstance(value, str) for value in (normalized, display, kind)):
            candidates.append((str(normalized), str(display), str(kind)))

    parser = _VisibleFactParser()
    try:
        parser.feed(normalized_body.decode("utf-8"))
    except (UnicodeDecodeError, ValueError) as exc:
        raise OfficeDiscoveryError("discovery_fact_html_parse_failed") from exc
    visible_candidates = list(parser.emails)
    visible_candidates.extend(
        match.group(0)
        for match in _VISIBLE_EMAIL_PATTERN.finditer(parser.visible_text)
    )
    for value in visible_candidates:
        normalized, display, kind = normalize_email(value)
        if normalized and display and kind:
            candidates.append((normalized, display, kind))

    deduplicated: dict[str, tuple[str, str, str]] = {}
    for candidate in candidates:
        deduplicated.setdefault(candidate[0], candidate)
    return tuple(
        sorted(
            deduplicated.values(),
            key=lambda item: (item[2] != "generic_business", item[0]),
        )
    )


def load_office_email_targets(database_url: str) -> tuple[OfficeEmailTarget, ...]:
    with psycopg.connect(database_url) as connection:
        rows = connection.execute(
            """
            SELECT 'office' AS target_type,
                   office.id::text AS target_id,
                   office.id::text AS office_id,
                   source.url
            FROM offices AS office
            INNER JOIN office_sources AS source ON source.office_id = office.id
            WHERE office.status IN ('draft', 'published')
              AND source.is_primary = true
              AND source.source_type = 'official_website'
              AND source.access_status = 'available'
            UNION ALL
            SELECT 'review' AS target_type,
                   review.id::text AS target_id,
                   review.office_id::text AS office_id,
                   record.source_url
            FROM review_items AS review
            INNER JOIN collected_records AS record
                ON record.id = review.collected_record_id
            WHERE review.status IN ('pending', 'on_hold')
              AND review.type IN ('new_office', 'field_change')
            ORDER BY target_type, target_id
            """
        ).fetchall()
    seen: set[tuple[str, str]] = set()
    targets: list[OfficeEmailTarget] = []
    for target_type, target_id, office_id, source_url in rows:
        normalized_source = normalize_source_url(str(source_url))
        identity = (str(target_id), normalized_source)
        if identity in seen:
            continue
        seen.add(identity)
        targets.append(
            OfficeEmailTarget(
                target_type=str(target_type),
                target_id=str(target_id),
                office_id=str(office_id) if office_id is not None else None,
                source_url=normalized_source,
            )
        )
    return tuple(targets)


def collect_office_email_candidates(
    *,
    targets: tuple[OfficeEmailTarget, ...],
    output_path: Path,
    user_agent: str,
    max_sources: int = 100,
    retention_days: int = 7,
    now: datetime | None = None,
    fetcher: Callable[..., bytes] = _fetch_official_source_html,
) -> OfficeEmailCandidateSummary:
    if not 1 <= max_sources <= 100:
        raise OfficeDiscoveryError("office_email_source_budget_invalid")
    if not 1 <= retention_days <= 21:
        raise OfficeDiscoveryError("office_email_retention_invalid")
    current = now or datetime.now(timezone.utc)
    if current.tzinfo is None:
        raise OfficeDiscoveryError("discovery_timestamp_must_be_timezone_aware")
    current = current.astimezone(timezone.utc)
    selected = targets[:max_sources]
    if not selected:
        raise OfficeDiscoveryError("office_email_targets_empty")
    expires_at = current + timedelta(days=retention_days)
    records: list[OfficeEmailCandidateRecord] = []
    for target in selected:
        try:
            body = fetcher(
                target.source_url,
                user_agent=user_agent,
                checked_at=current.date(),
            )
            candidates = extract_official_business_emails(
                body,
                source_url=target.source_url,
                user_agent=user_agent,
                checked_at=current.date(),
            )
        except (AdapterError, CollectorHttpError, OfficeDiscoveryError, OSError) as exc:
            reason = exc.code if isinstance(exc, CollectorHttpError) else str(exc)
            records.append(
                OfficeEmailCandidateRecord(
                    version=1,
                    rules_version="official-business-email-v1",
                    target_type=target.target_type,
                    target_id=target.target_id,
                    office_id=target.office_id,
                    source_url=target.source_url,
                    email_normalized=None,
                    email_display=None,
                    email_kind=None,
                    status="fetch_failed",
                    reason_code=reason,
                    checked_at=current.isoformat(),
                    expires_at=expires_at.isoformat(),
                    marketing_consent_status="not_obtained",
                    promotion_allowed=False,
                )
            )
            continue
        if not candidates:
            records.append(
                OfficeEmailCandidateRecord(
                    version=1,
                    rules_version="official-business-email-v1",
                    target_type=target.target_type,
                    target_id=target.target_id,
                    office_id=target.office_id,
                    source_url=target.source_url,
                    email_normalized=None,
                    email_display=None,
                    email_kind=None,
                    status="not_found",
                    reason_code="OFFICIAL_EMAIL_NOT_FOUND",
                    checked_at=current.isoformat(),
                    expires_at=expires_at.isoformat(),
                    marketing_consent_status="not_obtained",
                    promotion_allowed=False,
                )
            )
            continue
        status = "pending" if len(candidates) == 1 else "multiple_review_required"
        reason_code = None if len(candidates) == 1 else "MULTIPLE_OFFICIAL_EMAILS"
        for normalized, display, kind in candidates:
            records.append(
                OfficeEmailCandidateRecord(
                    version=1,
                    rules_version="official-business-email-v1",
                    target_type=target.target_type,
                    target_id=target.target_id,
                    office_id=target.office_id,
                    source_url=target.source_url,
                    email_normalized=normalized,
                    email_display=display,
                    email_kind=kind,
                    status=status,
                    reason_code=reason_code,
                    checked_at=current.isoformat(),
                    expires_at=expires_at.isoformat(),
                    marketing_consent_status="not_obtained",
                    promotion_allowed=False,
                )
            )
    _write_jsonl(output_path, records)
    status_counts = Counter(record.status for record in records)
    reason_counts = Counter(
        record.reason_code for record in records if record.reason_code
    )
    return OfficeEmailCandidateSummary(
        target_count=len(targets),
        checked_count=len(selected),
        email_candidate_count=sum(
            record.email_normalized is not None for record in records
        ),
        generic_business_count=sum(
            record.email_kind == "generic_business" for record in records
        ),
        unknown_count=sum(record.email_kind == "unknown" for record in records),
        no_email_count=status_counts["not_found"],
        failed_count=status_counts["fetch_failed"],
        reason_counts=dict(sorted(reason_counts.items())),
        output=str(output_path),
        expires_at=expires_at.isoformat(),
    )


def _business_service_evidence(value: str) -> tuple[str, ...]:
    normalized = normalize_result_text(value)
    return tuple(
        code
        for code, pattern in _SERVICE_EVIDENCE_PATTERNS
        if pattern.search(normalized)
    )


def _html_fallback_facts(
    body: bytes, *, candidate_name: str, candidate_address: str
) -> dict[str, object]:
    parser = _VisibleFactParser()
    try:
        parser.feed(body.decode("utf-8"))
    except (UnicodeDecodeError, ValueError) as exc:
        raise OfficeDiscoveryError("discovery_fact_html_parse_failed") from exc
    visible_text = parser.visible_text
    service_reason_codes = _business_service_evidence(visible_text)
    name_match = _name_matches(candidate_name, visible_text)
    address_match = _address_matches(candidate_address, visible_text)
    region_match = _region_matches(candidate_address, visible_text)
    phone_candidates = list(parser.telephones)
    phone_candidates.extend(
        "-".join(match.groups())
        for match in _VISIBLE_PHONE_PATTERN.finditer(visible_text)
    )
    phone_normalized: str | None = None
    phone_display: str | None = None
    for value in phone_candidates:
        normalized, display = normalize_phone(value)
        if normalized:
            phone_normalized = normalized
            phone_display = display
            break
    email_normalized: str | None = None
    email_display: str | None = None
    email_kind: str | None = None
    email_candidates = list(parser.emails)
    email_candidates.extend(
        match.group(0) for match in _VISIBLE_EMAIL_PATTERN.finditer(visible_text)
    )
    for value in email_candidates:
        normalized, display, kind = normalize_email(value)
        if normalized:
            email_normalized = normalized
            email_display = display
            email_kind = kind
            break
    return {
        "name": normalize_result_text(candidate_name) if name_match else None,
        "phoneNormalized": phone_normalized,
        "phoneDisplay": phone_display,
        "emailNormalized": email_normalized,
        "emailDisplay": email_display,
        "emailKind": email_kind,
        "addressText": candidate_address if address_match else None,
        "nameMatch": name_match,
        "addressMatch": address_match,
        "regionMatch": region_match,
        "businessServiceMatch": bool(service_reason_codes),
        "businessServiceReasonCodes": service_reason_codes,
    }


def _name_matches(candidate_name: str, extracted_name: str | None) -> bool:
    if not extracted_name:
        return False
    extracted = normalize_result_text(extracted_name).lower()
    terms = _candidate_name_terms(candidate_name)
    return bool(terms and any(term in extracted for term in terms))


def _address_matches(candidate_address: str, extracted_address: str | None) -> bool:
    if not extracted_address:
        return False
    candidate_key = normalize_address_key(candidate_address)
    extracted_key = normalize_address_key(extracted_address)
    return bool(
        min(len(candidate_key), len(extracted_key)) >= 8
        and (candidate_key in extracted_key or extracted_key in candidate_key)
    )


def _region_matches(candidate_address: str, extracted_address: str | None) -> bool:
    if not extracted_address:
        return False
    candidate_parts = normalize_result_text(candidate_address).split()
    if len(candidate_parts) < 2:
        return False
    city = candidate_parts[0]
    district = candidate_parts[1]
    extracted = normalize_result_text(extracted_address)
    city_aliases = (
        ("서울", "서울특별시")
        if city.startswith("서울")
        else ("경기", "경기도")
        if city.startswith("경기")
        else (city,)
    )
    return district in extracted and any(alias in extracted for alias in city_aliases)


def extract_official_source_facts(
    *,
    local_raw_path: Path,
    web_raw_path: Path,
    web_filtered_path: Path,
    probe_path: Path,
    output_path: Path,
    user_agent: str,
    max_sources: int = 10,
    now: datetime | None = None,
    fetcher: Callable[..., bytes] = _fetch_official_source_html,
) -> OfficialSourceFactSummary:
    if not 1 <= max_sources <= 50:
        raise OfficeDiscoveryError("discovery_fact_source_budget_invalid")
    current = now or datetime.now(timezone.utc)
    if current.tzinfo is None:
        raise OfficeDiscoveryError("discovery_timestamp_must_be_timezone_aware")
    current = current.astimezone(timezone.utc)
    local_records = load_raw_discovery_records(local_raw_path, now=current)
    web_records, filtered_records = _load_web_source_records(
        web_raw_path, web_filtered_path, now=current
    )
    probe_records = _load_probe_records(probe_path)
    local_by_id = {record.record_id: record for record in local_records}
    web_by_id = {record.record_id: record for record in web_records}
    filtered_by_id = {record.record_id: record for record in filtered_records}
    selected = [
        record
        for record in probe_records
        if record.status == "content_check_required"
        and record.record_id in web_by_id
        and record.record_id in filtered_by_id
    ][:max_sources]
    if not selected:
        raise OfficeDiscoveryError("discovery_fact_candidates_empty")

    expires_at = min(_parse_expiry(record.expires_at) for record in selected)
    adapter = JsonLdLocalBusinessAdapter()
    facts: list[OfficialSourceFactRecord] = []
    structured_record_count = 0
    for probe in selected:
        web = web_by_id[probe.record_id]
        parent = local_by_id.get(web.parent_record_id)
        if parent is None:
            raise OfficeDiscoveryError("discovery_fact_parent_record_missing")
        source_url = filtered_by_id[probe.record_id].normalized_url
        candidate_address = normalize_result_text(parent.road_address or parent.address)
        try:
            body = fetcher(
                source_url,
                user_agent=user_agent,
                checked_at=current.date(),
            )
            policy = _source_policy(source_url, user_agent, current.date())
            normalized_body = _normalize_html_encoding(body)
            normalized = [
                normalize_record(record)
                for record in adapter.extract(normalized_body, source_url, policy)
            ]
            fallback = _html_fallback_facts(
                normalized_body,
                candidate_name=parent.title,
                candidate_address=candidate_address,
            )
        except (AdapterError, CollectorHttpError, OfficeDiscoveryError, OSError) as exc:
            reason = exc.code if isinstance(exc, CollectorHttpError) else str(exc)
            facts.append(
                OfficialSourceFactRecord(
                    version=2,
                    rules_version="office-official-facts-v2",
                    record_id=probe.record_id,
                    run_id=probe.run_id,
                    parent_record_id=probe.parent_record_id,
                    source_url=source_url,
                    status="fetch_failed",
                    reason_code=reason,
                    extracted_name=None,
                    phone_normalized=None,
                    phone_display=None,
                    email_normalized=None,
                    email_display=None,
                    email_kind=None,
                    address_text=None,
                    name_match=False,
                    address_match=False,
                    region_match=False,
                    source_verification="required",
                    promotion_allowed=False,
                    checked_at=current.isoformat(),
                    expires_at=expires_at.isoformat(),
                )
            )
            continue

        structured_record_count += len(normalized)
        scored: list[tuple[int, NormalizedRecord]] = []
        for record in normalized:
            values = record.normalized_values
            name = values.get("name")
            address = values.get("addressText")
            phone = values.get("phoneNormalized")
            score = sum(
                (
                    4
                    if _name_matches(
                        parent.title, name if isinstance(name, str) else None
                    )
                    else 0,
                    3
                    if _address_matches(
                        candidate_address,
                        address if isinstance(address, str) else None,
                    )
                    else 0,
                    2
                    if _region_matches(
                        candidate_address,
                        address if isinstance(address, str) else None,
                    )
                    else 0,
                    1 if isinstance(phone, str) else 0,
                )
            )
            scored.append((score, record))
        best = max(scored, key=lambda item: item[0])[1] if scored else None
        values = best.normalized_values if best is not None else {}
        name = values.get("name") if isinstance(values.get("name"), str) else None
        phone_normalized = (
            values.get("phoneNormalized")
            if isinstance(values.get("phoneNormalized"), str)
            else None
        )
        phone_display = (
            values.get("phoneDisplay")
            if isinstance(values.get("phoneDisplay"), str)
            else None
        )
        email_normalized = (
            values.get("emailNormalized")
            if isinstance(values.get("emailNormalized"), str)
            else None
        )
        email_display = (
            values.get("emailDisplay")
            if isinstance(values.get("emailDisplay"), str)
            else None
        )
        email_kind = (
            values.get("emailKind")
            if isinstance(values.get("emailKind"), str)
            else None
        )
        address = (
            values.get("addressText")
            if isinstance(values.get("addressText"), str)
            else None
        )
        used_fallback = False
        if name is None and isinstance(fallback.get("name"), str):
            name = fallback["name"]
            used_fallback = True
        if phone_normalized is None and isinstance(
            fallback.get("phoneNormalized"), str
        ):
            phone_normalized = fallback["phoneNormalized"]
            phone_display = (
                fallback.get("phoneDisplay")
                if isinstance(fallback.get("phoneDisplay"), str)
                else None
            )
            used_fallback = True
        if email_normalized is None and isinstance(
            fallback.get("emailNormalized"), str
        ):
            email_normalized = fallback["emailNormalized"]
            email_display = (
                fallback.get("emailDisplay")
                if isinstance(fallback.get("emailDisplay"), str)
                else None
            )
            email_kind = (
                fallback.get("emailKind")
                if isinstance(fallback.get("emailKind"), str)
                else None
            )
            used_fallback = True
        if address is None and isinstance(fallback.get("addressText"), str):
            address = fallback["addressText"]
            used_fallback = True
        name_match = _name_matches(parent.title, name) or bool(
            fallback.get("nameMatch")
        )
        address_match = _address_matches(candidate_address, address) or bool(
            fallback.get("addressMatch")
        )
        region_match = _region_matches(candidate_address, address) or bool(
            fallback.get("regionMatch")
        )
        if name_match and (address_match or region_match) and phone_normalized:
            status = "strong_fact_match"
            reason_code = "HTML_FACT_SIGNALS_USED" if used_fallback else None
        elif (best is not None or used_fallback) and (
            name_match or address_match or region_match
        ):
            status = "partial_fact_match"
            reason_code = "MANUAL_FACT_REVIEW_REQUIRED"
        else:
            status = "insufficient_structured_data"
            reason_code = "FACT_MATCH_MISSING"
        facts.append(
            OfficialSourceFactRecord(
                version=2,
                rules_version="office-official-facts-v2",
                record_id=probe.record_id,
                run_id=probe.run_id,
                parent_record_id=probe.parent_record_id,
                source_url=source_url,
                status=status,
                reason_code=reason_code,
                extracted_name=name,
                phone_normalized=phone_normalized,
                phone_display=phone_display,
                email_normalized=email_normalized,
                email_display=email_display,
                email_kind=email_kind,
                address_text=address,
                name_match=name_match,
                address_match=address_match,
                region_match=region_match,
                source_verification="required",
                promotion_allowed=False,
                checked_at=current.isoformat(),
                expires_at=expires_at.isoformat(),
                business_service_match=bool(
                    fallback.get("businessServiceMatch")
                ),
                business_service_reason_codes=tuple(
                    fallback.get("businessServiceReasonCodes", ())
                ),
            )
        )
    _write_jsonl(output_path, facts)
    status_counts = Counter(record.status for record in facts)
    reason_counts = Counter(
        record.reason_code for record in facts if record.reason_code is not None
    )
    return OfficialSourceFactSummary(
        run_id=facts[0].run_id,
        candidate_count=len(facts),
        structured_record_count=structured_record_count,
        strong_match_count=status_counts["strong_fact_match"],
        partial_match_count=status_counts["partial_fact_match"],
        insufficient_count=status_counts["insufficient_structured_data"],
        failed_count=status_counts["fetch_failed"],
        business_service_match_count=sum(
            record.business_service_match for record in facts
        ),
        reason_counts=dict(sorted(reason_counts.items())),
        output=str(output_path),
        expires_at=expires_at.isoformat(),
    )


def build_discovery_review_queue(
    *,
    output_dir: Path,
    output_path: Path,
    duplicate_keys: dict[str, set[str]] | None = None,
    now: datetime | None = None,
) -> DiscoveryReviewSummary:
    current = now or datetime.now(timezone.utc)
    if current.tzinfo is None:
        raise OfficeDiscoveryError("discovery_timestamp_must_be_timezone_aware")
    current = current.astimezone(timezone.utc)

    local_by_id: dict[str, RawOfficeDiscoveryRecord] = {}
    for path in sorted(output_dir.glob("naver-local-*.raw.jsonl")):
        if _load_file_expiry(path) <= current:
            continue
        for record in load_raw_discovery_records(path, now=current):
            local_by_id[record.record_id] = record

    facts: list[OfficialSourceFactRecord] = []
    for path in sorted(output_dir.glob("naver-web-*.facts.jsonl")):
        if _load_file_expiry(path) <= current:
            continue
        for line_number, line in enumerate(
            path.read_text(encoding="utf-8").splitlines(), start=1
        ):
            try:
                facts.append(OfficialSourceFactRecord(**json.loads(line)))
            except (TypeError, ValueError, json.JSONDecodeError) as exc:
                raise OfficeDiscoveryError(
                    f"discovery_fact_record_invalid_at_line_{line_number}"
                ) from exc

    eligible = [
        fact
        for fact in facts
        if fact.status in {"strong_fact_match", "partial_fact_match"}
        and _parse_expiry(fact.expires_at) > current
    ]
    if not facts:
        raise OfficeDiscoveryError("discovery_fact_records_empty")
    ranked_by_identity: dict[
        str,
        tuple[
            tuple[int, int, int, int, int, str],
            OfficialSourceFactRecord,
            RawOfficeDiscoveryRecord,
        ],
    ] = {}
    missing_parent_count = 0
    for fact in eligible:
        parent = local_by_id.get(fact.parent_record_id)
        if parent is None:
            missing_parent_count += 1
            continue
        relevance = assess_business_relevance(parent.title, parent.category)
        rank = (
            4
            if relevance.status == "probable"
            else 2
            if relevance.status == "ambiguous"
            else 0,
            2 if fact.business_service_match else 0,
            2 if fact.status == "strong_fact_match" else 1,
            sum((fact.name_match, fact.address_match, fact.region_match)),
            1 if fact.phone_normalized else 0,
            fact.checked_at,
        )
        identity_hash = _identity_hash(parent)
        previous = ranked_by_identity.get(identity_hash)
        if previous is None or rank > previous[0]:
            ranked_by_identity[identity_hash] = (rank, fact, parent)

    database_keys = duplicate_keys or {
        key: set() for key in ("source", "name", "phone", "address", "slug")
    }
    source_host_counts = Counter(
        _canonical_host(fact.source_url)
        for _rank, fact, _parent in ranked_by_identity.values()
    )
    candidate_name_counts = Counter(
        normalize_result_text(parent.title).lower()
        for _rank, _fact, parent in ranked_by_identity.values()
    )
    review_records: list[DiscoveryReviewRecord] = []
    research_records: list[DiscoveryResearchRecord] = []
    reason_counts: Counter[str] = Counter()
    duplicate_count = max(
        0, len(eligible) - missing_parent_count - len(ranked_by_identity)
    )
    reason_counts["DUPLICATE_CANDIDATE_IDENTITY"] += duplicate_count
    reason_counts["MISSING_PARENT"] += missing_parent_count
    for fact in facts:
        if fact.status not in {"strong_fact_match", "partial_fact_match"}:
            reason_counts[f"FACT_STATUS_{fact.status.upper()}"] += 1
    for identity_hash, (_rank, fact, parent) in ranked_by_identity.items():
        candidate_address = normalize_result_text(
            parent.road_address or parent.address
        )
        candidate_name = normalize_result_text(parent.title)
        relevance = assess_business_relevance(candidate_name, parent.category)
        research_reasons: list[str] = []
        exclusion_reasons: list[str] = []
        if relevance.status == "irrelevant":
            exclusion_reasons.append("BUSINESS_RELEVANCE_IRRELEVANT")
        elif relevance.status != "probable":
            research_reasons.append("BUSINESS_RELEVANCE_REVIEW_REQUIRED")
        if fact.status != "strong_fact_match":
            research_reasons.append("STRONG_FACT_MATCH_REQUIRED")
        if not fact.phone_normalized:
            research_reasons.append("PHONE_REQUIRED")
        if not fact.business_service_match:
            research_reasons.append("OFFICIAL_SERVICE_EVIDENCE_REQUIRED")

        source_host = _canonical_host(fact.source_url)
        if _is_non_official_host(source_host):
            exclusion_reasons.append("OFFICIAL_SOURCE_REQUIRED")
        if source_host_counts[source_host] > 1:
            research_reasons.append("SHARED_SOURCE_BRANCH_REVIEW_REQUIRED")
        if candidate_name_counts[candidate_name.lower()] > 1:
            research_reasons.append("SHARED_NAME_BRANCH_REVIEW_REQUIRED")

        normalized_name = " ".join(candidate_name.lower().split())
        normalized_address = normalize_address_key(candidate_address)
        if normalized_name in database_keys.get("name", set()):
            research_reasons.append("EXISTING_NAME_REVIEW_REQUIRED")
        if normalized_address in database_keys.get("address", set()):
            exclusion_reasons.append("EXISTING_ADDRESS")
        if fact.phone_normalized in database_keys.get("phone", set()):
            exclusion_reasons.append("EXISTING_PHONE")
        try:
            normalized_source = normalize_source_url(fact.source_url)
        except CandidateBatchError:
            normalized_source = ""
            exclusion_reasons.append("OFFICIAL_SOURCE_REQUIRED")
        if normalized_source in database_keys.get("source", set()):
            exclusion_reasons.append("EXISTING_SOURCE")

        exclusion_reasons = list(dict.fromkeys(exclusion_reasons))
        research_reasons = list(dict.fromkeys(research_reasons))
        reason_counts.update(exclusion_reasons or research_reasons)
        if exclusion_reasons:
            continue
        if research_reasons:
            research_records.append(
                DiscoveryResearchRecord(
                    version=1,
                    rules_version="office-discovery-research-v2",
                    candidate_id=identity_hash,
                    candidate_name=candidate_name,
                    candidate_address=candidate_address,
                    phone_normalized=fact.phone_normalized,
                    phone_display=fact.phone_display,
                    email_normalized=fact.email_normalized,
                    email_display=fact.email_display,
                    email_kind=fact.email_kind,
                    source_url=fact.source_url,
                    evidence_status=fact.status,
                    business_relevance=relevance.status,
                    relevance_reason_codes=relevance.reason_codes,
                    business_service_match=fact.business_service_match,
                    research_reason_codes=tuple(research_reasons),
                    evidence_run_id=fact.run_id,
                    checked_at=fact.checked_at,
                    expires_at=fact.expires_at,
                    review_status="research_required",
                    promotion_allowed=False,
                )
            )
            continue
        review_records.append(
            DiscoveryReviewRecord(
                version=2,
                rules_version="office-discovery-review-v2",
                candidate_id=identity_hash,
                candidate_name=candidate_name,
                candidate_address=candidate_address,
                phone_normalized=fact.phone_normalized,
                phone_display=fact.phone_display,
                email_normalized=fact.email_normalized,
                email_display=fact.email_display,
                email_kind=fact.email_kind,
                source_url=fact.source_url,
                evidence_status=fact.status,
                business_relevance=relevance.status,
                relevance_reason_codes=relevance.reason_codes,
                business_service_match=fact.business_service_match,
                name_match=fact.name_match,
                address_match=fact.address_match,
                region_match=fact.region_match,
                evidence_run_id=fact.run_id,
                checked_at=fact.checked_at,
                expires_at=fact.expires_at,
                review_status="pending",
                promotion_allowed=False,
            )
        )
    review_records.sort(
        key=lambda record: (
            record.evidence_status != "strong_fact_match",
            record.candidate_name,
            record.candidate_id,
        )
    )
    research_records.sort(
        key=lambda record: (record.candidate_name, record.candidate_id)
    )
    _write_jsonl(output_path, review_records)
    research_output_path = output_path.with_name(
        output_path.name.removesuffix(".jsonl") + ".research.jsonl"
    )
    _write_jsonl(research_output_path, research_records)
    status_counts = Counter(record.evidence_status for record in review_records)
    expires_at = min(_parse_expiry(record.expires_at) for record in facts)
    return DiscoveryReviewSummary(
        fact_count=len(facts),
        eligible_fact_count=len(eligible),
        candidate_count=len(review_records),
        strong_match_count=status_counts["strong_fact_match"],
        partial_match_count=status_counts["partial_fact_match"],
        research_count=len(research_records),
        excluded_count=max(
            0, len(facts) - len(review_records) - len(research_records)
        ),
        duplicate_count=duplicate_count,
        missing_parent_count=missing_parent_count,
        reason_counts=dict(
            sorted(
                (reason, count)
                for reason, count in reason_counts.items()
                if count > 0
            )
        ),
        output=str(output_path),
        research_output=str(research_output_path),
        expires_at=expires_at.isoformat(),
    )
