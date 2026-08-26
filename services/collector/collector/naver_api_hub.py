from __future__ import annotations

import time
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

import httpx


NAVER_API_HUB_BASE_URL = "https://naverapihub.apigw.ntruss.com"
_RETRYABLE_STATUS_CODES = frozenset({429, 500, 502, 503, 504})
_LOCAL_ITEM_FIELDS = (
    "title",
    "link",
    "category",
    "description",
    "telephone",
    "address",
    "roadAddress",
    "mapx",
    "mapy",
)
_WEB_ITEM_FIELDS = ("title", "link", "description")


class NaverApiHubError(RuntimeError):
    pass


@dataclass(frozen=True)
class NaverSearchResponse:
    endpoint: str
    query: str
    total: int
    start: int
    display: int
    items: tuple[dict[str, str], ...]


def _text(value: Any, *, maximum: int) -> str:
    if not isinstance(value, str):
        return ""
    return value[:maximum]


def _integer(value: Any, *, default: int = 0) -> int:
    return value if isinstance(value, int) and not isinstance(value, bool) else default


class NaverApiHubClient:
    def __init__(
        self,
        client_id: str,
        client_secret: str,
        *,
        max_requests: int,
        max_attempts: int = 2,
        timeout_seconds: float = 10.0,
        transport: httpx.BaseTransport | None = None,
        sleep: Callable[[float], None] = time.sleep,
    ) -> None:
        if not client_id or not client_secret:
            raise NaverApiHubError("naver_api_credentials_missing")
        if not 1 <= max_requests <= 100:
            raise NaverApiHubError("naver_api_request_budget_invalid")
        if not 1 <= max_attempts <= 2:
            raise NaverApiHubError("naver_api_attempt_limit_invalid")
        self._max_requests = max_requests
        self._max_attempts = max_attempts
        self._request_count = 0
        self._sleep = sleep
        self._client = httpx.Client(
            base_url=NAVER_API_HUB_BASE_URL,
            headers={
                "Accept": "application/json",
                "X-NCP-APIGW-API-KEY-ID": client_id,
                "X-NCP-APIGW-API-KEY": client_secret,
            },
            timeout=httpx.Timeout(timeout_seconds),
            follow_redirects=False,
            limits=httpx.Limits(max_connections=1, max_keepalive_connections=1),
            trust_env=False,
            transport=transport,
        )

    @property
    def request_count(self) -> int:
        return self._request_count

    def __enter__(self) -> NaverApiHubClient:
        return self

    def __exit__(self, *_: object) -> None:
        self.close()

    def close(self) -> None:
        self._client.close()

    def search_local(
        self,
        query: str,
        *,
        display: int = 5,
        sort: str = "random",
    ) -> NaverSearchResponse:
        normalized_query = " ".join(query.split())
        if not normalized_query or len(normalized_query) > 200:
            raise NaverApiHubError("naver_local_query_invalid")
        if not 1 <= display <= 5:
            raise NaverApiHubError("naver_local_display_invalid")
        if sort not in {"random", "comment"}:
            raise NaverApiHubError("naver_local_sort_invalid")
        return self._search(
            endpoint="local",
            path="/search/v1/local",
            query=normalized_query,
            params={
                "query": normalized_query,
                "display": display,
                "start": 1,
                "sort": sort,
                "format": "json",
            },
            item_fields=_LOCAL_ITEM_FIELDS,
        )

    def search_web(
        self,
        query: str,
        *,
        display: int = 10,
        start: int = 1,
    ) -> NaverSearchResponse:
        normalized_query = " ".join(query.split())
        if not normalized_query or len(normalized_query) > 200:
            raise NaverApiHubError("naver_web_query_invalid")
        if not 1 <= display <= 100:
            raise NaverApiHubError("naver_web_display_invalid")
        if not 1 <= start <= 1_000:
            raise NaverApiHubError("naver_web_start_invalid")
        return self._search(
            endpoint="webkr",
            path="/search/v1/webkr",
            query=normalized_query,
            params={
                "query": normalized_query,
                "display": display,
                "start": start,
                "format": "json",
            },
            item_fields=_WEB_ITEM_FIELDS,
        )

    def _search(
        self,
        *,
        endpoint: str,
        path: str,
        query: str,
        params: dict[str, object],
        item_fields: tuple[str, ...],
    ) -> NaverSearchResponse:
        response: httpx.Response | None = None
        for attempt in range(1, self._max_attempts + 1):
            if self._request_count >= self._max_requests:
                raise NaverApiHubError("naver_api_request_budget_exhausted")
            self._request_count += 1
            try:
                response = self._client.get(path, params=params)
            except (httpx.TimeoutException, httpx.NetworkError) as exc:
                if attempt >= self._max_attempts:
                    raise NaverApiHubError("naver_api_network_failed") from exc
                self._sleep(0.5)
                continue
            if response.status_code in _RETRYABLE_STATUS_CODES:
                if attempt >= self._max_attempts:
                    raise NaverApiHubError("naver_api_retry_exhausted")
                self._sleep(0.5)
                continue
            if response.status_code in {401, 403}:
                raise NaverApiHubError("naver_api_auth_or_permission_failed")
            if response.status_code != 200:
                raise NaverApiHubError(f"naver_api_http_{response.status_code}")
            break

        if response is None:
            raise NaverApiHubError("naver_api_no_response")
        if len(response.content) > 1_000_000:
            raise NaverApiHubError("naver_api_response_too_large")
        try:
            payload = response.json()
        except ValueError as exc:
            raise NaverApiHubError("naver_api_response_not_json") from exc
        if not isinstance(payload, dict) or not isinstance(payload.get("items"), list):
            raise NaverApiHubError("naver_api_response_schema_invalid")

        items: list[dict[str, str]] = []
        for raw_item in payload["items"]:
            if not isinstance(raw_item, dict):
                continue
            items.append(
                {
                    field: _text(raw_item.get(field), maximum=2_000)
                    for field in item_fields
                }
            )
        return NaverSearchResponse(
            endpoint=endpoint,
            query=query,
            total=max(_integer(payload.get("total")), 0),
            start=max(_integer(payload.get("start"), default=1), 1),
            display=max(_integer(payload.get("display")), 0),
            items=tuple(items),
        )
