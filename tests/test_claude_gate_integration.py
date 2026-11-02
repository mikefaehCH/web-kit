import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from test_claude_verdict import SHA, pass_payload

VALIDATOR = Path("scripts/validate_claude_review.py")


class GateCliIntegrationTests(unittest.TestCase):
    def invoke(self, raw_json, provider_outcome="success"):
        with tempfile.TemporaryDirectory() as directory:
            verdict = Path(directory) / "verdict.json"
            verdict.write_text(raw_json, encoding="utf-8")
            return subprocess.run(
                [sys.executable, str(VALIDATOR), str(verdict), SHA, provider_outcome],
                check=False,
                capture_output=True,
                text=True,
            )

    def test_valid_pass_is_successful_status_result(self):
        result = self.invoke(json.dumps(pass_payload()))
        self.assertEqual(result.returncode, 0)
        self.assertEqual(result.stdout.strip(), "PASS")

    def test_fail_and_inconclusive_are_blocked(self):
        for verdict in ("FAIL", "INCONCLUSIVE"):
            with self.subTest(verdict=verdict):
                result = self.invoke(json.dumps(pass_payload(verdict=verdict)))
                self.assertNotEqual(result.returncode, 0)
                self.assertEqual(result.stdout.strip(), "FAIL")

    def test_malformed_missing_and_stale_responses_are_blocked(self):
        cases = (
            "",
            "{truncated",
            json.dumps(pass_payload(reviewed_sha="b" * 40)),
            json.dumps(pass_payload(extra="unexpected")),
        )
        for raw in cases:
            with self.subTest(raw=raw):
                result = self.invoke(raw)
                self.assertNotEqual(result.returncode, 0)
                self.assertEqual(result.stdout.strip(), "FAIL")

    def test_api_error_or_timeout_blocks_even_a_pass_shaped_response(self):
        for outcome in ("failure", "timed_out"):
            with self.subTest(outcome=outcome):
                result = self.invoke(json.dumps(pass_payload()), provider_outcome=outcome)
                self.assertNotEqual(result.returncode, 0)
                self.assertEqual(result.stdout.strip(), "FAIL")


if __name__ == "__main__":
    unittest.main()
