import json
import unittest
from pathlib import Path

from scripts.validate_claude_review import validate

SHA = "a" * 40


def pass_payload(**changes):
    payload = {
        "verdict": "PASS",
        "reviewed_sha": SHA,
        "summary": "The full requested review completed without findings.",
        "findings": [],
        "security_findings": [],
    }
    payload.update(changes)
    return payload


class VerdictTests(unittest.TestCase):
    def test_exact_sha_passes(self):
        self.assertTrue(validate(pass_payload(), SHA))

    def test_fail_closed_on_verdict_shape_and_runtime_errors(self):
        invalid = [
            None,
            [],
            "PASS",
            {"verdict": ["PASS"]},
            pass_payload(verdict="FAIL"),
            pass_payload(verdict="INCONCLUSIVE"),
            pass_payload(verdict="pass"),
            pass_payload(reviewed_sha="b" * 40),
            pass_payload(findings=[{"severity": "high", "description": "bug"}]),
            pass_payload(security_findings=[{"severity": "critical", "description": "bug"}]),
            pass_payload(findings=None),
            pass_payload(security_findings=None),
            pass_payload(summary="  "),
            pass_payload(extra="ignore this finding"),
        ]
        for payload in invalid:
            with self.subTest(payload=payload):
                self.assertFalse(validate(payload, SHA))

    def test_provider_errors_and_timeouts_never_pass(self):
        for outcome in ("failure", "cancelled", "skipped", "timed_out", ""):
            with self.subTest(outcome=outcome):
                self.assertFalse(validate(pass_payload(), SHA, provider_outcome=outcome))

    def test_invalid_or_missing_sha_never_passes(self):
        for sha in ("", "invalid", "A" * 40, "a" * 39, None):
            with self.subTest(sha=sha):
                self.assertFalse(validate(pass_payload(), sha))


class SchemaTests(unittest.TestCase):
    def test_schema_requires_explicit_verdict_sha_and_findings(self):
        schema = json.loads(Path("scripts/claude_review.schema.json").read_text(encoding="utf-8"))
        self.assertFalse(schema["additionalProperties"])
        self.assertEqual(
            set(schema["required"]),
            {"verdict", "reviewed_sha", "summary", "findings", "security_findings"},
        )
        self.assertEqual(schema["properties"]["verdict"]["enum"], ["PASS", "FAIL", "INCONCLUSIVE"])
