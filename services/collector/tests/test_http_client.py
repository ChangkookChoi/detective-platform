from __future__ import annotations

import unittest

import httpx

from collector.http_client import (
    CollectorHttpError,
    PolicyHttpClient,
    validate_source_url,
)
from collector.models import RetryPolicy
from tests.helpers import source_policy


class PolicyHttpClientTest(unittest.TestCase):
    def test_retries_transient_status_then_succeeds(self) -> None:
        calls = 0
        sleeps: list[float] = []

        def handler(request: httpx.Request) -> httpx.Response:
            nonlocal calls
            calls += 1
            if calls < 3:
                return httpx.Response(503, headers={"Retry-After": "0"})
            return httpx.Response(200, content=b"ok", headers={"ETag": '"v1"'})

        client = PolicyHttpClient(
            source_policy(),
            transport=httpx.MockTransport(handler),
            resolver=lambda _: ["8.8.8.8"],
            sleep=sleeps.append,
        )
        with client:
            result = client.fetch("https://example.com/offices/sample")

        self.assertEqual(result.body, b"ok")
        self.assertEqual(result.etag, '"v1"')
        self.assertEqual(calls, 3)
        self.assertEqual(sleeps, [0.0, 0.0])

    def test_does_not_retry_not_found(self) -> None:
        calls = 0

        def handler(request: httpx.Request) -> httpx.Response:
            nonlocal calls
            calls += 1
            return httpx.Response(404)

        client = PolicyHttpClient(
            source_policy(),
            transport=httpx.MockTransport(handler),
            resolver=lambda _: ["8.8.8.8"],
            sleep=lambda _: None,
        )
        with client, self.assertRaisesRegex(CollectorHttpError, "http_status_404"):
            client.fetch("https://example.com/offices/sample")
        self.assertEqual(calls, 1)

    def test_rejects_redirect_to_unapproved_host(self) -> None:
        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(302, headers={"Location": "https://other.test/private"})

        client = PolicyHttpClient(
            source_policy(),
            transport=httpx.MockTransport(handler),
            resolver=lambda _: ["8.8.8.8"],
        )
        with client, self.assertRaisesRegex(CollectorHttpError, "url_host_rejected"):
            client.fetch("https://example.com/offices/sample")

    def test_rejects_private_address(self) -> None:
        with self.assertRaisesRegex(CollectorHttpError, "url_address_rejected"):
            validate_source_url(
                "https://example.com/offices/sample",
                source_policy(),
                resolver=lambda _: ["127.0.0.1"],
            )

    def test_stops_when_response_is_too_large(self) -> None:
        client = PolicyHttpClient(
            source_policy(
                max_response_bytes=1024,
                retry=RetryPolicy(1, 0.1, 1),
            ),
            transport=httpx.MockTransport(
                lambda request: httpx.Response(200, content=b"x" * 1025)
            ),
            resolver=lambda _: ["8.8.8.8"],
        )
        with client, self.assertRaisesRegex(CollectorHttpError, "response_too_large"):
            client.fetch("https://example.com/offices/sample")


if __name__ == "__main__":
    unittest.main()
