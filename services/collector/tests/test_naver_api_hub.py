from __future__ import annotations

import unittest

import httpx

from collector.naver_api_hub import NaverApiHubClient, NaverApiHubError


class NaverApiHubClientTests(unittest.TestCase):
    def test_search_local_uses_api_hub_headers_and_limits_fields(self) -> None:
        def handler(request: httpx.Request) -> httpx.Response:
            self.assertEqual(request.headers["X-NCP-APIGW-API-KEY-ID"], "test-id")
            self.assertEqual(request.headers["X-NCP-APIGW-API-KEY"], "test-secret")
            self.assertEqual(request.url.path, "/search/v1/local")
            return httpx.Response(
                200,
                json={
                    "total": 1,
                    "start": 1,
                    "display": 1,
                    "items": [
                        {
                            "title": "테스트 탐정사무소",
                            "link": "https://example.com",
                            "category": "서비스>탐정",
                            "description": "설명",
                            "telephone": "",
                            "address": "서울특별시 강남구 테스트동 1",
                            "roadAddress": "서울특별시 강남구 테스트로 1",
                            "mapx": "127.0",
                            "mapy": "37.0",
                            "unexpected": "discarded",
                        }
                    ],
                },
            )

        with NaverApiHubClient(
            "test-id",
            "test-secret",
            max_requests=1,
            transport=httpx.MockTransport(handler),
        ) as client:
            response = client.search_local("강남구 탐정사무소", display=1)

        self.assertEqual(response.endpoint, "local")
        self.assertEqual(response.items[0]["title"], "테스트 탐정사무소")
        self.assertNotIn("unexpected", response.items[0])

    def test_search_web_parses_only_document_fields(self) -> None:
        transport = httpx.MockTransport(
            lambda _: httpx.Response(
                200,
                json={
                    "total": 1,
                    "start": 1,
                    "display": 1,
                    "items": [
                        {
                            "title": "공식 홈페이지",
                            "link": "https://example.com",
                            "description": "검색 요약",
                            "address": "discarded",
                        }
                    ],
                },
            )
        )
        with NaverApiHubClient(
            "test-id",
            "test-secret",
            max_requests=1,
            transport=transport,
        ) as client:
            response = client.search_web("테스트 탐정 공식 홈페이지", display=1)

        self.assertEqual(
            set(response.items[0]), {"title", "link", "description"}
        )

    def test_enforces_request_budget_before_extra_call(self) -> None:
        transport = httpx.MockTransport(
            lambda _: httpx.Response(
                200,
                json={"total": 0, "start": 1, "display": 0, "items": []},
            )
        )
        with NaverApiHubClient(
            "test-id",
            "test-secret",
            max_requests=1,
            transport=transport,
        ) as client:
            client.search_local("강남구 탐정사무소")
            with self.assertRaisesRegex(
                NaverApiHubError, "naver_api_request_budget_exhausted"
            ):
                client.search_local("송파구 탐정사무소")

    def test_reports_auth_failure_without_credentials(self) -> None:
        transport = httpx.MockTransport(lambda _: httpx.Response(403))
        with NaverApiHubClient(
            "test-id",
            "test-secret",
            max_requests=1,
            transport=transport,
        ) as client:
            with self.assertRaisesRegex(
                NaverApiHubError, "naver_api_auth_or_permission_failed"
            ) as context:
                client.search_local("강남구 탐정사무소")

        self.assertNotIn("test-secret", str(context.exception))


if __name__ == "__main__":
    unittest.main()
