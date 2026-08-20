from __future__ import annotations

import ipaddress
import json
import re
import socket
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import asdict, dataclass
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit, urlunsplit
from urllib.robotparser import RobotFileParser

import httpx
import psycopg


ALLOWED_SOURCE_TYPES = {
    "official_website",
    "official_social_profile",
    "public_registry",
    "association_directory",
    "other",
}
ALLOWED_CATEGORY_SLUGS = {
    "infidelity",
    "family",
    "people-search",
    "evidence-fact-checking",
    "personal-safety",
}
SLUG_PATTERN = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
PHONE_DIGIT_PATTERN = re.compile(r"\D+")
LEADING_POSTAL_CODE_PATTERN = re.compile(r"^\d{5}\s+")
ADDRESS_SEPARATOR_PATTERN = re.compile(r"[\W_]+", re.UNICODE)
REGISTRY_STATUS_PATTERN = re.compile(r"`([a-z_]+)`")
AI_BLOCKED_AGENTS = {"gptbot", "chatgpt-user"}
INVALID_PAGE_MARKERS = (
    "사이트 기간 만료",
    "domain expired",
    "account suspended",
    "site not found",
)


class CandidateBatchError(ValueError):
    pass


@dataclass(frozen=True)
class Candidate:
    source_url: str
    name: str
    phone_display: str
    address_text: str
    slug: str
    region_slug: str
    service_category_slugs: tuple[str, ...]
    source_type: str
    evidence_note: str
    manual_policy_reviewed: bool
    distinct_branch_reviewed: bool
    recheck_reason: str | None


@dataclass(frozen=True)
class CandidateBatch:
    batch_id: str
    verified_at: date
    candidates: tuple[Candidate, ...]


@dataclass(frozen=True)
class RegistryEntry:
    key: str
    host: str
    status: str


@dataclass(frozen=True)
class NetworkCheck:
    status: str
    robots_status: int | None
    source_status: int | None
    final_url: str | None
    content_bytes: int
    reason: str | None


def _required_text(
    value: Any, field: str, *, minimum: int = 1, maximum: int = 2_000
) -> str:
    if not isinstance(value, str):
        raise CandidateBatchError(f"{field}_must_be_string")
    normalized = " ".join(value.split())
    if not minimum <= len(normalized) <= maximum:
        raise CandidateBatchError(f"{field}_invalid_length")
    return normalized


def normalize_source_url(value: Any) -> str:
    source_url = _required_text(value, "sourceUrl")
    parts = urlsplit(source_url)
    if (
        parts.scheme != "https"
        or not parts.hostname
        or parts.username
        or parts.password
        or parts.port not in (None, 443)
    ):
        raise CandidateBatchError("sourceUrl_must_be_public_https")
    path = parts.path or "/"
    return urlunsplit(("https", parts.netloc.lower(), path, parts.query, ""))


def normalize_phone_key(value: str) -> str:
    digits = PHONE_DIGIT_PATTERN.sub("", value)
    if digits.startswith("82") and 9 <= len(digits[2:]) <= 10:
        return f"0{digits[2:]}"
    return digits


def normalize_address_key(value: str) -> str:
    without_postal_code = LEADING_POSTAL_CODE_PATTERN.sub(
        "", value.strip().lower()
    )
    return ADDRESS_SEPARATOR_PATTERN.sub("", without_postal_code)


def _load_candidate(raw: Any, index: int) -> Candidate:
    if not isinstance(raw, dict):
        raise CandidateBatchError(f"candidates[{index}]_must_be_object")
    categories = raw.get("serviceCategorySlugs")
    if (
        not isinstance(categories, list)
        or not categories
        or len(categories) > len(ALLOWED_CATEGORY_SLUGS)
        or any(not isinstance(value, str) for value in categories)
    ):
        raise CandidateBatchError(f"candidates[{index}].serviceCategorySlugs_invalid")
    normalized_categories = tuple(dict.fromkeys(categories))
    if set(normalized_categories) - ALLOWED_CATEGORY_SLUGS:
        raise CandidateBatchError(f"candidates[{index}].serviceCategorySlugs_unknown")
    slug = _required_text(raw.get("slug"), f"candidates[{index}].slug", maximum=80)
    if not SLUG_PATTERN.fullmatch(slug):
        raise CandidateBatchError(f"candidates[{index}].slug_invalid")
    source_type = _required_text(
        raw.get("sourceType"), f"candidates[{index}].sourceType", maximum=50
    )
    if source_type not in ALLOWED_SOURCE_TYPES:
        raise CandidateBatchError(f"candidates[{index}].sourceType_unknown")
    manual_policy_reviewed = raw.get("manualPolicyReviewed", False)
    if not isinstance(manual_policy_reviewed, bool):
        raise CandidateBatchError(
            f"candidates[{index}].manualPolicyReviewed_must_be_boolean"
        )
    distinct_branch_reviewed = raw.get("distinctBranchReviewed", False)
    if not isinstance(distinct_branch_reviewed, bool):
        raise CandidateBatchError(
            f"candidates[{index}].distinctBranchReviewed_must_be_boolean"
        )
    if distinct_branch_reviewed and source_type != "official_website":
        raise CandidateBatchError(
            f"candidates[{index}].distinctBranchReviewed_requires_official_website"
        )
    recheck_reason_raw = raw.get("recheckReason")
    recheck_reason = (
        _required_text(
            recheck_reason_raw,
            f"candidates[{index}].recheckReason",
            minimum=5,
            maximum=500,
        )
        if recheck_reason_raw is not None
        else None
    )
    phone_display = _required_text(
        raw.get("phoneDisplay"), f"candidates[{index}].phoneDisplay", maximum=50
    )
    phone_digits = PHONE_DIGIT_PATTERN.sub("", phone_display)
    if not 8 <= len(phone_digits) <= 11:
        raise CandidateBatchError(f"candidates[{index}].phoneDisplay_invalid")
    region_slug = _required_text(
        raw.get("regionSlug"), f"candidates[{index}].regionSlug", maximum=100
    )
    if not region_slug.startswith(("seoul-", "gyeonggi-")):
        raise CandidateBatchError(f"candidates[{index}].regionSlug_out_of_scope")
    return Candidate(
        source_url=normalize_source_url(raw.get("sourceUrl")),
        name=_required_text(
            raw.get("name"), f"candidates[{index}].name", minimum=2, maximum=200
        ),
        phone_display=phone_display,
        address_text=_required_text(
            raw.get("addressText"),
            f"candidates[{index}].addressText",
            minimum=5,
            maximum=500,
        ),
        slug=slug,
        region_slug=region_slug,
        service_category_slugs=normalized_categories,
        source_type=source_type,
        evidence_note=_required_text(
            raw.get("evidenceNote"),
            f"candidates[{index}].evidenceNote",
            minimum=10,
            maximum=1_000,
        ),
        manual_policy_reviewed=manual_policy_reviewed,
        distinct_branch_reviewed=distinct_branch_reviewed,
        recheck_reason=recheck_reason,
    )


def load_candidate_batch(path: Path) -> CandidateBatch:
    raw = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(raw, dict) or raw.get("version") != 1:
        raise CandidateBatchError("unsupported_manifest_version")
    batch_id = _required_text(raw.get("batchId"), "batchId", maximum=100)
    try:
        verified_at = date.fromisoformat(_required_text(raw.get("verifiedAt"), "verifiedAt"))
    except ValueError as exc:
        raise CandidateBatchError("verifiedAt_invalid") from exc
    candidates_raw = raw.get("candidates")
    if not isinstance(candidates_raw, list) or not candidates_raw:
        raise CandidateBatchError("candidates_must_be_non_empty_array")
    if len(candidates_raw) > 50:
        raise CandidateBatchError("candidates_batch_too_large")
    candidates = tuple(
        _load_candidate(candidate, index)
        for index, candidate in enumerate(candidates_raw)
    )
    slugs = [item.slug for item in candidates]
    if len(slugs) != len(set(slugs)):
        raise CandidateBatchError("duplicate_slug_in_manifest")
    identities = [
        (item.source_url, normalize_address_key(item.address_text))
        for item in candidates
    ]
    if len(identities) != len(set(identities)):
        raise CandidateBatchError("duplicate_source_address_in_manifest")
    source_counts: dict[str, int] = {}
    for item in candidates:
        source_counts[item.source_url] = source_counts.get(item.source_url, 0) + 1
    if any(
        source_counts[item.source_url] > 1 and not item.distinct_branch_reviewed
        for item in candidates
    ):
        raise CandidateBatchError("shared_source_requires_distinct_branch_review")
    return CandidateBatch(
        batch_id=batch_id, verified_at=verified_at, candidates=candidates
    )


def load_source_registry(path: Path) -> dict[str, RegistryEntry]:
    entries: dict[str, RegistryEntry] = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        if not line.startswith("| `"):
            continue
        cells = [cell.strip() for cell in line.strip().strip("|").split("|")]
        if len(cells) < 3:
            continue
        key = cells[0].strip("`")
        status_match = REGISTRY_STATUS_PATTERN.search(cells[2])
        if not status_match:
            continue
        parse_target = key if "://" in key else f"https://{key}"
        host = (urlsplit(parse_target).hostname or "").lower()
        if host:
            entries[host] = RegistryEntry(
                key=key, host=host, status=status_match.group(1)
            )
    return entries


def robots_explicitly_blocks_ai(text: str) -> bool:
    active_agents: set[str] = set()
    for raw_line in text.splitlines():
        line = raw_line.split("#", 1)[0].strip()
        if not line or ":" not in line:
            continue
        field, value = (part.strip() for part in line.split(":", 1))
        field_lower = field.lower()
        if field_lower == "user-agent":
            active_agents.add(value.lower())
            continue
        if field_lower == "disallow":
            if active_agents & AI_BLOCKED_AGENTS and value == "/":
                return True
            continue
        active_agents.clear()
    return False


def _resolve_public_host(host: str) -> None:
    addresses = socket.getaddrinfo(host, 443, type=socket.SOCK_STREAM)
    if not addresses:
        raise CandidateBatchError("dns_no_addresses")
    for address in addresses:
        ip = ipaddress.ip_address(address[4][0])
        if not ip.is_global:
            raise CandidateBatchError("host_resolves_to_non_public_address")


def _site_host(host: str) -> str:
    normalized = host.rstrip(".").lower()
    return normalized[4:] if normalized.startswith("www.") else normalized


def _is_same_site_host(source_host: str, final_host: str) -> bool:
    return _site_host(source_host) == _site_host(final_host)


def _stream_response(response: httpx.Response, maximum: int) -> tuple[int, bytes]:
    total = 0
    prefix = bytearray()
    for chunk in response.iter_bytes():
        total += len(chunk)
        if total > maximum:
            raise CandidateBatchError("source_response_too_large")
        if len(prefix) < 200_000:
            prefix.extend(chunk[: 200_000 - len(prefix)])
    return total, bytes(prefix)


def page_has_invalid_marker(content: bytes) -> bool:
    text = content.decode("utf-8", errors="replace").lower()
    return any(marker in text for marker in INVALID_PAGE_MARKERS)


def check_source_network(
    source_url: str,
    *,
    manual_policy_reviewed: bool,
    user_agent: str,
    timeout_seconds: float = 12.0,
    max_response_bytes: int = 2_500_000,
) -> NetworkCheck:
    parts = urlsplit(source_url)
    host = parts.hostname or ""
    try:
        _resolve_public_host(host)
        robots_url = f"https://{parts.netloc}/robots.txt"
        headers = {"User-Agent": user_agent, "Accept": "text/plain,text/html;q=0.8"}
        with httpx.Client(
            headers=headers,
            timeout=httpx.Timeout(timeout_seconds),
            follow_redirects=True,
            max_redirects=3,
        ) as client:
            robots_response = client.get(robots_url)
            robots_status = robots_response.status_code
            robots_final_parts = urlsplit(str(robots_response.url))
            if (
                robots_final_parts.scheme != "https"
                or not robots_final_parts.hostname
                or not _is_same_site_host(host, robots_final_parts.hostname)
            ):
                return NetworkCheck(
                    "blocked",
                    robots_status,
                    None,
                    str(robots_response.url),
                    0,
                    "unsafe_robots_redirect",
                )
            _resolve_public_host(robots_final_parts.hostname)
            if robots_status == 200:
                robots_text = robots_response.text[:200_000]
                if robots_explicitly_blocks_ai(robots_text):
                    return NetworkCheck(
                        "blocked",
                        robots_status,
                        None,
                        None,
                        0,
                        "robots_explicit_ai_block",
                    )
                parser = RobotFileParser()
                parser.set_url(robots_url)
                parser.parse(robots_text.splitlines())
                if not parser.can_fetch(user_agent, source_url):
                    return NetworkCheck(
                        "blocked",
                        robots_status,
                        None,
                        None,
                        0,
                        "robots_disallow",
                    )
                policy_status = "eligible"
            elif robots_status in {404, 410}:
                policy_status = "manual_policy_review"
            elif robots_status in {401, 403, 429}:
                return NetworkCheck(
                    "blocked",
                    robots_status,
                    None,
                    None,
                    0,
                    f"robots_http_{robots_status}",
                )
            else:
                return NetworkCheck(
                    "deferred",
                    robots_status,
                    None,
                    None,
                    0,
                    f"robots_http_{robots_status}",
                )
            with client.stream("GET", source_url) as response:
                source_status = response.status_code
                final_parts = urlsplit(str(response.url))
                if final_parts.scheme != "https" or not final_parts.hostname:
                    return NetworkCheck(
                        "blocked",
                        robots_status,
                        source_status,
                        str(response.url),
                        0,
                        "unsafe_final_url",
                    )
                if not _is_same_site_host(host, final_parts.hostname):
                    return NetworkCheck(
                        "blocked",
                        robots_status,
                        source_status,
                        str(response.url),
                        0,
                        "cross_site_source_redirect",
                    )
                _resolve_public_host(final_parts.hostname)
                if source_status != 200:
                    return NetworkCheck(
                        "deferred",
                        robots_status,
                        source_status,
                        str(response.url),
                        0,
                        f"source_http_{source_status}",
                    )
                content_bytes, content_prefix = _stream_response(
                    response, max_response_bytes
                )
                if page_has_invalid_marker(content_prefix):
                    return NetworkCheck(
                        "deferred",
                        robots_status,
                        source_status,
                        str(response.url),
                        content_bytes,
                        "invalid_or_expired_site_page",
                    )
            if policy_status == "manual_policy_review" and not manual_policy_reviewed:
                return NetworkCheck(
                    policy_status,
                    robots_status,
                    source_status,
                    str(response.url),
                    content_bytes,
                    "manual_policy_confirmation_required",
                )
            return NetworkCheck(
                policy_status,
                robots_status,
                source_status,
                str(response.url),
                content_bytes,
                None,
            )
    except CandidateBatchError as exc:
        return NetworkCheck("deferred", None, None, None, 0, str(exc))
    except (httpx.HTTPError, OSError, socket.gaierror) as exc:
        return NetworkCheck("deferred", None, None, None, 0, type(exc).__name__)


def check_candidate_network(
    candidate: Candidate,
    *,
    user_agent: str,
    timeout_seconds: float = 12.0,
    max_response_bytes: int = 2_500_000,
) -> NetworkCheck:
    return check_source_network(
        candidate.source_url,
        manual_policy_reviewed=candidate.manual_policy_reviewed,
        user_agent=user_agent,
        timeout_seconds=timeout_seconds,
        max_response_bytes=max_response_bytes,
    )


def load_database_duplicate_keys(database_url: str) -> dict[str, set[str]]:
    result = {"source": set(), "name": set(), "phone": set(), "address": set(), "slug": set()}
    with psycopg.connect(database_url) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                select offices.slug, offices.name, coalesce(offices.phone_normalized, ''),
                       coalesce(offices.address_text, ''), office_sources.url
                from offices
                left join office_sources on office_sources.office_id = offices.id
                where offices.status <> 'archived'
                """
            )
            for slug, name, phone, address, source in cursor.fetchall():
                result["slug"].add(str(slug).lower())
                result["name"].add(" ".join(str(name).lower().split()))
                if phone:
                    result["phone"].add(normalize_phone_key(str(phone)))
                if address:
                    result["address"].add(normalize_address_key(str(address)))
                if source:
                    try:
                        result["source"].add(normalize_source_url(str(source)))
                    except CandidateBatchError:
                        continue
    return result


def load_active_leaf_region_slugs(database_url: str) -> set[str]:
    with psycopg.connect(database_url) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                select parent.slug
                from regions as parent
                where parent.is_active = true
                  and parent.parent_id is not null
                  and not exists (
                    select 1 from regions as child
                    where child.parent_id = parent.id and child.is_active = true
                  )
                """
            )
            return {str(row[0]) for row in cursor.fetchall()}


def load_active_leaf_region_queries(database_url: str) -> tuple[str, ...]:
    with psycopg.connect(database_url) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                select leaf.name, parent.name, grandparent.name
                from regions as leaf
                join regions as parent on parent.id = leaf.parent_id
                left join regions as grandparent on grandparent.id = parent.parent_id
                where leaf.is_active = true
                  and parent.is_active = true
                  and not exists (
                    select 1 from regions as child
                    where child.parent_id = leaf.id and child.is_active = true
                  )
                  and (
                    parent.name in ('서울특별시', '경기도')
                    or grandparent.name = '경기도'
                  )
                order by coalesce(grandparent.display_order, parent.display_order),
                         parent.display_order, leaf.display_order
                """
            )
            queries: list[str] = []
            for leaf, parent, grandparent in cursor.fetchall():
                if str(parent) == "서울특별시":
                    queries.append(f"서울 {leaf}")
                elif str(parent) == "경기도":
                    queries.append(f"경기 {leaf}")
                elif str(grandparent) == "경기도":
                    queries.append(f"경기 {parent} {leaf}")
            return tuple(queries)


def load_published_offices(database_url: str) -> dict[str, dict[str, Any]]:
    with psycopg.connect(database_url) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                select offices.slug, offices.name, offices.phone_display,
                       offices.address_text, regions.slug, office_sources.url,
                       coalesce(array_agg(distinct service_categories.slug)
                         filter (where service_categories.slug is not null), '{}')
                from offices
                join regions on regions.id = offices.region_id
                join office_sources on office_sources.office_id = offices.id
                  and office_sources.is_primary = true
                left join office_service_categories
                  on office_service_categories.office_id = offices.id
                left join service_categories
                  on service_categories.id = office_service_categories.service_category_id
                where offices.status = 'published'
                group by offices.id, regions.slug, office_sources.url
                """
            )
            return {
                str(row[0]): {
                    "name": str(row[1]),
                    "phoneDisplay": str(row[2]),
                    "addressText": str(row[3]),
                    "regionSlug": str(row[4]),
                    "sourceUrl": normalize_source_url(str(row[5])),
                    "serviceCategorySlugs": sorted(str(value) for value in row[6]),
                }
                for row in cursor.fetchall()
            }


def candidate_matches_published(
    candidate: Candidate, published: dict[str, Any] | None
) -> bool:
    if published is None:
        return False
    return published == {
        "name": candidate.name,
        "phoneDisplay": candidate.phone_display,
        "addressText": candidate.address_text,
        "regionSlug": candidate.region_slug,
        "sourceUrl": candidate.source_url,
        "serviceCategorySlugs": sorted(candidate.service_category_slugs),
    }


def candidate_duplicate_reasons(
    candidate: Candidate, duplicate_keys: dict[str, set[str]]
) -> list[str]:
    comparisons = {
        "source": candidate.source_url,
        "slug": candidate.slug.lower(),
        "name": " ".join(candidate.name.lower().split()),
        "phone": normalize_phone_key(candidate.phone_display),
        "address": normalize_address_key(candidate.address_text),
    }
    return [key for key, value in comparisons.items() if value in duplicate_keys[key]]


def candidate_has_blocking_duplicate(
    candidate: Candidate, duplicate_reasons: list[str]
) -> bool:
    if not duplicate_reasons:
        return False
    if "slug" in duplicate_reasons or "address" in duplicate_reasons:
        return True
    return not candidate.distinct_branch_reviewed


def run_candidate_preflight(
    batch: CandidateBatch,
    registry: dict[str, RegistryEntry],
    *,
    user_agent: str,
    database_url: str | None,
    max_workers: int = 4,
) -> dict[str, Any]:
    duplicate_keys = (
        load_database_duplicate_keys(database_url)
        if database_url
        else {key: set() for key in ("source", "name", "phone", "address", "slug")}
    )
    active_leaf_regions = (
        load_active_leaf_region_slugs(database_url) if database_url else None
    )
    published_offices = load_published_offices(database_url) if database_url else {}
    results: list[dict[str, Any]] = []
    network_candidates: list[Candidate] = []
    preliminary: dict[str, dict[str, Any]] = {}
    for candidate in batch.candidates:
        host = (urlsplit(candidate.source_url).hostname or "").lower()
        registry_entry = registry.get(host)
        duplicate_reasons = candidate_duplicate_reasons(candidate, duplicate_keys)
        blocked_by_registry = registry_entry and registry_entry.status in {
            "manual_approved",
            "manual_registered",
            "manual_on_hold",
        }
        if (
            candidate.distinct_branch_reviewed
            and registry_entry
            and registry_entry.status == "manual_approved"
        ):
            blocked_by_registry = False
        recheck_required = registry_entry is not None and registry_entry.status in {
            "deferred",
            "blocked",
        }
        base = {
            "sourceUrl": candidate.source_url,
            "slug": candidate.slug,
            "name": candidate.name,
            "registryStatus": registry_entry.status if registry_entry else None,
            "duplicateReasons": duplicate_reasons,
        }
        if candidate_matches_published(
            candidate, published_offices.get(candidate.slug)
        ):
            preliminary[candidate.slug] = {
                **base,
                "resumeExactPublished": True,
            }
            network_candidates.append(candidate)
        elif (
            active_leaf_regions is not None
            and candidate.region_slug not in active_leaf_regions
        ):
            preliminary[candidate.slug] = {
                **base,
                "status": "deferred",
                "eligibleForManualIntake": False,
                "reason": "region_slug_must_be_active_leaf",
            }
        elif (
            candidate_has_blocking_duplicate(candidate, duplicate_reasons)
            or blocked_by_registry
        ):
            preliminary[candidate.slug] = {
                **base,
                "status": "duplicate",
                "eligibleForManualIntake": False,
                "reason": "existing_registry_or_database_match",
            }
        elif recheck_required and not candidate.recheck_reason:
            preliminary[candidate.slug] = {
                **base,
                "status": "deferred",
                "eligibleForManualIntake": False,
                "reason": "recheck_reason_required",
            }
        elif registry_entry and registry_entry.status == "blocked":
            preliminary[candidate.slug] = {
                **base,
                "status": "blocked",
                "eligibleForManualIntake": False,
                "reason": "blocked_registry_requires_separate_human_clearance",
            }
        else:
            preliminary[candidate.slug] = base
            network_candidates.append(candidate)

    network_results: dict[str, NetworkCheck] = {}
    candidates_by_host: dict[str, list[Candidate]] = {}
    for candidate in network_candidates:
        host = (urlsplit(candidate.source_url).hostname or "").lower()
        candidates_by_host.setdefault(host, []).append(candidate)

    def check_host(candidates: list[Candidate]) -> dict[str, NetworkCheck]:
        return {
            candidate.source_url: check_candidate_network(
                candidate, user_agent=user_agent
            )
            for candidate in {item.source_url: item for item in candidates}.values()
        }

    with ThreadPoolExecutor(max_workers=max(1, min(max_workers, 4))) as executor:
        futures = {
            executor.submit(check_host, candidates): host
            for host, candidates in candidates_by_host.items()
        }
        for future in as_completed(futures):
            network_results.update(future.result())

    for candidate in batch.candidates:
        base = preliminary[candidate.slug]
        network = network_results.get(candidate.source_url)
        if network is None:
            results.append(base)
            continue
        eligible = network.status == "eligible" or (
            network.status == "manual_policy_review"
            and candidate.manual_policy_reviewed
            and network.reason is None
        )
        result = {
            **base,
            **asdict(network),
            "eligibleForManualIntake": eligible,
        }
        if base.get("resumeExactPublished") is True and eligible:
            result.update(
                {
                    "networkStatus": network.status,
                    "status": "already_published",
                    "reason": "exact_published_match",
                }
            )
        results.append(result)

    eligible_count = sum(
        1 for result in results if result.get("eligibleForManualIntake") is True
    )
    return {
        "version": 1,
        "batchId": batch.batch_id,
        "verifiedAt": batch.verified_at.isoformat(),
        "checkedAt": datetime.now(timezone.utc).isoformat(),
        "candidateCount": len(batch.candidates),
        "eligibleCount": eligible_count,
        "ok": eligible_count == len(batch.candidates),
        "results": results,
    }
