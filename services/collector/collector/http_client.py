from __future__ import annotations

import ipaddress
import socket
import time
from collections.abc import Callable, Iterable
from email.utils import parsedate_to_datetime
from urllib.parse import urljoin, urlsplit

import httpx

from collector.models import ConditionalMetadata, FetchResult, SourcePolicy

_RETRYABLE_STATUSES = frozenset({429, 500, 502, 503, 504})
_REDIRECT_STATUSES = frozenset({301, 302, 303, 307, 308})

Resolver = Callable[[str], Iterable[str]]


class CollectorHttpError(RuntimeError):
    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


def _default_resolver(host: str) -> Iterable[str]:
    return {
        item[4][0]
        for item in socket.getaddrinfo(host, 443, type=socket.SOCK_STREAM)
    }


def validate_source_url(
    url: str,
    policy: SourcePolicy,
    resolver: Resolver = _default_resolver,
) -> None:
    parsed = urlsplit(url)
    host = (parsed.hostname or "").lower()
    try:
        port = parsed.port
    except ValueError as exc:
        raise CollectorHttpError("url_policy_rejected") from exc
    if (
        parsed.scheme != "https"
        or not host
        or parsed.username is not None
        or parsed.password is not None
        or parsed.fragment
        or port not in (None, 443)
    ):
        raise CollectorHttpError("url_policy_rejected")
    if host not in policy.allowed_hosts:
        raise CollectorHttpError("url_host_rejected")
    if not any(parsed.path.startswith(prefix) for prefix in policy.allowed_path_prefixes):
        raise CollectorHttpError("url_path_rejected")

    try:
        addresses = tuple(resolver(host))
    except OSError as exc:
        raise CollectorHttpError("dns_resolution_failed") from exc
    if not addresses:
        raise CollectorHttpError("dns_resolution_failed")
    try:
        if any(not ipaddress.ip_address(address).is_global for address in addresses):
            raise CollectorHttpError("url_address_rejected")
    except ValueError as exc:
        raise CollectorHttpError("dns_resolution_failed") from exc


def _safe_conditional_value(value: str | None) -> str | None:
    if value is None or "\r" in value or "\n" in value:
        return None
    return value[:1024]


def _retry_after_seconds(response: httpx.Response, maximum: float) -> float | None:
    value = response.headers.get("Retry-After")
    if not value:
        return None
    try:
        return min(max(float(value), 0), maximum)
    except ValueError:
        try:
            retry_at = parsedate_to_datetime(value)
            seconds = retry_at.timestamp() - time.time()
            return min(max(seconds, 0), maximum)
        except (TypeError, ValueError, OverflowError):
            return None


class PolicyHttpClient:
    def __init__(
        self,
        policy: SourcePolicy,
        *,
        transport: httpx.BaseTransport | None = None,
        resolver: Resolver = _default_resolver,
        sleep: Callable[[float], None] = time.sleep,
    ) -> None:
        self._policy = policy
        self._resolver = resolver
        self._sleep = sleep
        timeout = httpx.Timeout(
            connect=policy.timeout.connect_seconds,
            read=policy.timeout.read_seconds,
            write=policy.timeout.write_seconds,
            pool=policy.timeout.pool_seconds,
        )
        self._client = httpx.Client(
            timeout=timeout,
            limits=httpx.Limits(max_connections=1, max_keepalive_connections=1),
            follow_redirects=False,
            trust_env=False,
            transport=transport,
            headers={"User-Agent": policy.user_agent, "Accept": "text/html"},
        )

    def __enter__(self) -> PolicyHttpClient:
        return self

    def __exit__(self, *_: object) -> None:
        self.close()

    def close(self) -> None:
        self._client.close()

    def fetch(
        self,
        url: str,
        conditional: ConditionalMetadata | None = None,
    ) -> FetchResult:
        headers: dict[str, str] = {}
        if conditional is not None:
            etag = _safe_conditional_value(conditional.etag)
            last_modified = _safe_conditional_value(conditional.last_modified)
            if etag:
                headers["If-None-Match"] = etag
            if last_modified:
                headers["If-Modified-Since"] = last_modified

        backoff = self._policy.retry.initial_backoff_seconds
        for attempt in range(1, self._policy.retry.max_attempts + 1):
            try:
                result, retry_after = self._attempt(url, headers)
                if result is not None:
                    return result
            except (httpx.TimeoutException, httpx.NetworkError):
                retry_after = None

            if attempt == self._policy.retry.max_attempts:
                raise CollectorHttpError("http_retry_exhausted")
            self._sleep(retry_after if retry_after is not None else backoff)
            backoff = min(backoff * 2, self._policy.retry.max_backoff_seconds)

        raise CollectorHttpError("http_retry_exhausted")

    def _attempt(
        self, original_url: str, headers: dict[str, str]
    ) -> tuple[FetchResult | None, float | None]:
        current_url = original_url
        for redirect_count in range(self._policy.max_redirects + 1):
            validate_source_url(current_url, self._policy, self._resolver)
            request = self._client.build_request("GET", current_url, headers=headers)
            response = self._client.send(request, stream=True)
            try:
                if response.status_code in _REDIRECT_STATUSES:
                    location = response.headers.get("Location")
                    if location is None or redirect_count >= self._policy.max_redirects:
                        raise CollectorHttpError("redirect_rejected")
                    current_url = urljoin(current_url, location)
                    continue
                if response.status_code in _RETRYABLE_STATUSES:
                    return None, _retry_after_seconds(
                        response, self._policy.retry.max_backoff_seconds
                    )
                if response.status_code == 304:
                    return (
                        FetchResult(
                            url=current_url,
                            status_code=304,
                            body=None,
                            etag=response.headers.get("ETag"),
                            last_modified=response.headers.get("Last-Modified"),
                            not_modified=True,
                        ),
                        None,
                    )
                if response.status_code < 200 or response.status_code >= 300:
                    raise CollectorHttpError(f"http_status_{response.status_code}")

                body = bytearray()
                for chunk in response.iter_bytes():
                    body.extend(chunk)
                    if len(body) > self._policy.max_response_bytes:
                        raise CollectorHttpError("response_too_large")
                return (
                    FetchResult(
                        url=current_url,
                        status_code=response.status_code,
                        body=bytes(body),
                        etag=response.headers.get("ETag"),
                        last_modified=response.headers.get("Last-Modified"),
                    ),
                    None,
                )
            finally:
                response.close()
        raise CollectorHttpError("redirect_rejected")
