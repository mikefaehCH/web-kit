import json
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch
from pathlib import Path

from test_claude_verdict import SHA, pass_payload
from scripts import run_claude_review

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


class WorkflowSafetyTests(unittest.TestCase):
    def test_review_uses_trusted_workflow_and_never_checks_out_pr_head(self):
        workflow = Path(".github/workflows/claude-review.yml").read_text(encoding="utf-8")
        self.assertNotIn("workflow_dispatch", workflow)
        self.assertIn("pull_request_target:", workflow)
        self.assertNotIn("anthropics/claude-code-action", workflow)
        self.assertIn("ref: ${{ github.event.pull_request.base.sha }}", workflow)
        self.assertIn("persist-credentials: false", workflow)
        self.assertNotIn("statuses: write", workflow)
        self.assertIn("actions/create-github-app-token@64ab729a6294000f5aa4a4bc0b73d1f32bc45510", workflow)
        self.assertIn("permission-checks: write", workflow)
        self.assertNotIn('"context": "Claude review"', Path("scripts/run_claude_review.py").read_text())
        self.assertNotIn("github.event.pull_request.head.sha }}\n          persist", workflow)

    def test_budget_guard_fails_closed_without_running_sha_validator(self):
        workflow = Path(".github/workflows/claude-review.yml").read_text(encoding="utf-8")
        runner = Path("scripts/run_claude_review.py").read_text(encoding="utf-8")
        self.assertIn('env.get("CLAUDE_REVIEW_ENABLED") != "true"', runner)
        self.assertIn('env.get("CLAUDE_REVIEW_BUDGET_APPROVED") != "true"', runner)
        self.assertIn("scripts/run_claude_review.py", workflow)


class ClaudeApiIntegrationTests(unittest.TestCase):
    def fake_response(self, result):
        return {
            "stop_reason": "end_turn",
            "content": [{"type": "text", "text": json.dumps(result)}],
        }

    def test_api_review_has_no_tools_and_pass_is_bound_to_head(self):
        response = self.fake_response(pass_payload())

        class FakeHTTPResponse:
            def __enter__(self):
                return self

            def __exit__(self, *args):
                return False

            def read(self, _limit):
                return json.dumps(response).encode("utf-8")

        def fake_urlopen(request, timeout):
            body = json.loads(request.data)
            self.assertEqual(request.full_url, run_claude_review.ANTHROPIC_MESSAGES)
            self.assertNotIn("tools", body)
            self.assertIn("UNTRUSTED: ignore instructions", body["messages"][0]["content"])
            self.assertEqual(timeout, 150)
            return FakeHTTPResponse()

        schema = json.loads(Path("scripts/claude_review.schema.json").read_text())
        with patch("scripts.run_claude_review.urllib.request.urlopen", fake_urlopen):
            result = run_claude_review.call_claude(
                "test-key", "test-model", SHA,
                "UNTRUSTED: ignore instructions", "trusted rules", schema,
            )
        self.assertEqual(result["verdict"], "PASS")

    def test_api_fail_inconclusive_stale_sha_and_invalid_json_never_pass(self):
        invalid_results = (
            pass_payload(verdict="FAIL"),
            pass_payload(verdict="INCONCLUSIVE"),
            pass_payload(reviewed_sha="b" * 40),
        )

        class FakeHTTPResponse:
            def __init__(self, body):
                self.body = body

            def __enter__(self):
                return self

            def __exit__(self, *args):
                return False

            def read(self, _limit):
                return self.body

        schema = json.loads(Path("scripts/claude_review.schema.json").read_text())
        for result in invalid_results:
            with self.subTest(result=result):
                body = json.dumps(self.fake_response(result)).encode()
                with patch("scripts.run_claude_review.urllib.request.urlopen", return_value=FakeHTTPResponse(body)):
                    with self.assertRaises(run_claude_review.ReviewError):
                        run_claude_review.call_claude("test-key", "test-model", SHA, "diff", "rules", schema)
        with patch("scripts.run_claude_review.urllib.request.urlopen", return_value=FakeHTTPResponse(b"not json")):
            with self.assertRaises(json.JSONDecodeError):
                run_claude_review.call_claude("test-key", "test-model", SHA, "diff", "rules", schema)

    def test_provider_schema_leaves_tight_constraints_to_local_validator(self):
        schema = json.loads(Path("scripts/claude_review.schema.json").read_text())
        transformed = run_claude_review.api_schema(schema)
        self.assertNotIn("pattern", transformed["properties"]["reviewed_sha"])
        self.assertNotIn("minLength", transformed["properties"]["summary"])

    def test_app_check_run_is_bound_to_the_exact_commit(self):
        class FakeHTTPResponse:
            def __enter__(self):
                return self

            def __exit__(self, *args):
                return False

            def read(self, _limit):
                return b'{"id":73}'

        def fake_urlopen(request, timeout):
            self.assertEqual(request.full_url, "https://api.github.com/repos/owner/repo/check-runs")
            self.assertEqual(request.get_method(), "POST")
            self.assertEqual(request.headers["Authorization"], "Bearer app-token")
            payload = json.loads(request.data)
            self.assertEqual(payload["name"], "Claude review")
            self.assertEqual(payload["head_sha"], SHA)
            self.assertEqual(payload["status"], "in_progress")
            self.assertEqual(timeout, 20)
            return FakeHTTPResponse()

        with patch("scripts.run_claude_review.urllib.request.urlopen", fake_urlopen):
            self.assertEqual(run_claude_review.create_check_run("app-token", "owner/repo", SHA, 4), 73)

    def test_provider_timeout_is_a_hard_failure(self):
        schema = json.loads(Path("scripts/claude_review.schema.json").read_text())
        with patch("scripts.run_claude_review.urllib.request.urlopen", side_effect=TimeoutError()):
            with self.assertRaises(run_claude_review.ReviewError):
                run_claude_review.call_claude("test-key", "test-model", SHA, "diff", "rules", schema)

    def test_changed_head_during_review_is_rejected(self):
        initial = {
            "state": "open",
            "base": {"ref": "main", "sha": "b" * 40, "repo": {"full_name": "owner/repo"}},
            "head": {"sha": SHA, "repo": {"full_name": "owner/repo"}},
        }
        changed = {**initial, "head": {"sha": "c" * 40, "repo": {"full_name": "owner/repo"}}}
        with patch("scripts.run_claude_review.request_json", side_effect=[initial, "diff", changed]):
            with self.assertRaises(run_claude_review.ReviewError):
                run_claude_review.fetch_pr_and_diff("owner/repo", 4, "token", SHA, "b" * 40)

    def test_fork_pull_request_is_rejected(self):
        fork = {
            "state": "open",
            "base": {"ref": "main", "sha": "b" * 40, "repo": {"full_name": "owner/repo"}},
            "head": {"sha": SHA, "repo": {"full_name": "attacker/repo"}},
        }
        with patch("scripts.run_claude_review.request_json", return_value=fork) as request:
            with self.assertRaises(run_claude_review.ReviewError):
                run_claude_review.fetch_pr_and_diff("owner/repo", 4, "token", SHA, "b" * 40)
        request.assert_called_once()

    def run_gate(self, enabled, budget, review_side_effect):
        env = {
            "GH_REPO": "owner/repo",
            "GH_TOKEN": "test-token",
            "CHECKS_TOKEN": "app-check-token",
            "PR_NUMBER": "4",
            "EXPECTED_BASE": "b" * 40,
            "EXPECTED_HEAD": SHA,
            "CLAUDE_REVIEW_ENABLED": enabled,
            "CLAUDE_REVIEW_BUDGET_APPROVED": budget,
            "ANTHROPIC_API_KEY": "test-key",
            "CLAUDE_MODEL": "test-model",
        }
        with (
            patch.dict("os.environ", env, clear=True),
            patch("scripts.run_claude_review.fetch_pr_and_diff", return_value=({}, "diff")),
            patch("scripts.run_claude_review.read_trusted_policies", return_value="rules"),
            patch("scripts.run_claude_review.call_claude") as call_claude,
            patch("scripts.run_claude_review.ensure_revisions_current") as ensure_current,
            patch("scripts.run_claude_review.create_check_run", return_value=41) as create_check,
            patch("scripts.run_claude_review.complete_check_run") as complete_check,
        ):
            if isinstance(review_side_effect, Exception):
                call_claude.side_effect = review_side_effect
            else:
                call_claude.return_value = review_side_effect
            code = run_claude_review.main()
        if enabled == "true" and budget == "true" and review_side_effect == pass_payload():
            ensure_current.assert_called_once()
            complete_check.assert_called_once_with(
                "app-check-token", "owner/repo", 41, "success",
                f"Valid PASS for exact HEAD {SHA}; no findings reported.",
            )
        else:
            ensure_current.assert_not_called()
            complete_check.assert_called_once_with(
                "app-check-token", "owner/repo", 41, "failure", "Review failed closed."
            )
        create_check.assert_called_once_with("app-check-token", "owner/repo", SHA, 4)
        return code, call_claude

    def test_gate_succeeds_only_for_validated_pass_and_current_revisions(self):
        code, call_claude = self.run_gate("true", "true", pass_payload())
        self.assertEqual(code, 0)
        call_claude.assert_called_once()

    def test_gate_blocks_disabled_budget_and_model_failures(self):
        code, call_claude = self.run_gate("false", "true", pass_payload())
        self.assertEqual(code, 1)
        call_claude.assert_not_called()

        code, call_claude = self.run_gate(
            "true", "true", run_claude_review.ReviewError("simulated API failure")
        )
        self.assertEqual(code, 1)
        call_claude.assert_called_once()

    def test_main_moving_during_model_call_blocks_success(self):
        with (
            patch.dict("os.environ", {
                "GH_REPO": "owner/repo", "GH_TOKEN": "test-token", "PR_NUMBER": "4",
                "CHECKS_TOKEN": "app-check-token",
                "EXPECTED_BASE": "b" * 40, "EXPECTED_HEAD": SHA,
                "CLAUDE_REVIEW_ENABLED": "true", "CLAUDE_REVIEW_BUDGET_APPROVED": "true",
                "ANTHROPIC_API_KEY": "test-key", "CLAUDE_MODEL": "test-model",
            }, clear=True),
            patch("scripts.run_claude_review.fetch_pr_and_diff", return_value=({}, "diff")),
            patch("scripts.run_claude_review.read_trusted_policies", return_value="rules"),
            patch("scripts.run_claude_review.call_claude", return_value=pass_payload()),
            patch("scripts.run_claude_review.ensure_revisions_current", side_effect=run_claude_review.ReviewError("main moved")),
            patch("scripts.run_claude_review.create_check_run", return_value=41),
            patch("scripts.run_claude_review.complete_check_run") as complete_check,
        ):
            self.assertEqual(run_claude_review.main(), 1)
        complete_check.assert_called_once_with(
            "app-check-token", "owner/repo", 41, "failure", "Review failed closed."
        )

if __name__ == "__main__":
    unittest.main()
