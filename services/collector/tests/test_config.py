from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from collector.config import ConfigError, load_source_policies


class SourceConfigTest(unittest.TestCase):
    def _load(self, document: str):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "sources.toml"
            path.write_text(document, encoding="utf-8")
            return load_source_policies(path)

    def test_example_configuration_is_valid(self) -> None:
        path = Path(__file__).parents[1] / "sources.example.toml"
        policies = load_source_policies(path)
        self.assertEqual(list(policies), ["replace-with-approved-source"])

    def test_rejects_source_without_robots_approval(self) -> None:
        document = (Path(__file__).parents[1] / "sources.example.toml").read_text(
            encoding="utf-8"
        )
        with self.assertRaisesRegex(ConfigError, "robots_not_approved"):
            self._load(document.replace("robots_allowed = true", "robots_allowed = false"))

    def test_rejects_unapproved_field(self) -> None:
        document = (Path(__file__).parents[1] / "sources.example.toml").read_text(
            encoding="utf-8"
        )
        with self.assertRaisesRegex(ConfigError, "unsupported_allowed_field"):
            self._load(document.replace('"description"]', '"description", "email"]'))

    def test_rejects_initial_backoff_above_maximum(self) -> None:
        document = (Path(__file__).parents[1] / "sources.example.toml").read_text(
            encoding="utf-8"
        )
        with self.assertRaisesRegex(ConfigError, "initial_backoff_exceeds_maximum"):
            self._load(
                document.replace(
                    "initial_backoff_seconds = 1.0",
                    "initial_backoff_seconds = 9.0",
                )
            )


if __name__ == "__main__":
    unittest.main()
