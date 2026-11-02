"""End-to-end gate tests against an in-memory GitHub check-run backend.

The provider is replaced by a local fake; no network access and no paid call.
"""

import base64
import contextlib
import http.client
import io
import json
import os
import unittest
import urllib.error
import urllib.parse
from unittest.mock import patch

from test_claude_verdict import pass_payload
from scripts import run_claude_review as rcr

APP_ID = 123
BASE = "b" * 40
HEAD_A = "a" * 40
HEAD_B = "c" * 40
HEAD_C = "d" * 40
FILES = [{"filename": "src/app.py", "status": "modified", "additions": 1, "deletions": 0,
          "changes": 1, "patch": "@@ -1 +1,2 @@\n x\n+y"}]
CONTENT = {"src/app.py": "x\ny\n"}


def provider_body(result=None, *, stop_reason="end_turn", content=None) -> bytes:
    if content is None:
        content = [{"type": "text", "text": json.dumps(result)}]
    return json.dumps({"stop_reason": stop_reason, "content": content}).encode()


class FakeGitHub:
    def __init__(self):
        self.next_id = 100
        self.runs: dict[int, dict] = {}
        self.prs: dict[int, dict] = {}
        self.main = BASE
        self.fail_ledger_post = False
        self.fail_ledger_patch = False
        self.ledger_app_override = None
        self.hide_ledger = False
        self.before_ledger_post = None
        self.after_ledger_post = None
        self.after_ledger_patch = None
        self.fail_ledger_list = False
        self.request_count = 0

    def add_pr(self, number, head, files=FILES, content=CONTENT, base=BASE):
        self.prs[number] = {"head": head, "base": base, "files": files, "content": content}

    # --- check runs -------------------------------------------------------
    def insert_run(self, name, head_sha, external_id, status, conclusion=None, app_id=APP_ID):
        run_id = self.next_id
        self.next_id += 1
        self.runs[run_id] = {
            "id": run_id, "name": name, "head_sha": head_sha, "external_id": external_id,
            "status": status, "conclusion": conclusion, "app": {"id": app_id}, "output": {},
        }
        return run_id

    def runs_named(self, name, head_sha=None):
        return [run for run in self.runs.values()
                if run["name"] == name and (head_sha is None or run["head_sha"] == head_sha)]

    def pr_check(self, number):
        head = self.prs[number]["head"]
        checks = self.runs_named(rcr.PR_CHECK_NAME, head)
        return max(checks, key=lambda run: run["id"]) if checks else None

    def ledger(self):
        return self.runs_named(rcr.LEDGER_CHECK_NAME)

    # --- API ----------------------------------------------------------------
    def request_json(self, url, *, token, accept="application/vnd.github+json"):
        self.request_count += 1
        parsed = urllib.parse.urlsplit(url)
        query = urllib.parse.parse_qs(parsed.query)
        parts = parsed.path.split("/")[4:]  # after /repos/owner/repo
        if parts[0] == "pulls":
            pr = self.prs[int(parts[1])]
            if len(parts) == 3 and parts[2] == "files":
                page = int(query.get("page", ["1"])[0])
                return [dict(record) for record in pr["files"][(page - 1) * 100: page * 100]]
            return {
                "state": "open",
                "base": {"ref": "main", "sha": pr["base"], "repo": {"full_name": "owner/repo"}},
                "head": {"sha": pr["head"], "repo": {"full_name": "owner/repo"}},
                "changed_files": len(pr["files"]),
            }
        if parts[0] == "contents":
            path = urllib.parse.unquote("/".join(parts[1:]))
            ref = query["ref"][0]
            pr = next(p for p in self.prs.values() if ref in (p["head"], p["base"]))
            raw = pr["content"][path].encode()
            return {"type": "file", "encoding": "base64", "content": base64.b64encode(raw).decode()}
        if parts[:3] == ["git", "ref", "heads"]:
            return {"object": {"sha": self.main}}
        if parts[0] == "commits" and parts[2] == "check-runs":
            name = query.get("check_name", [None])[0]
            page = int(query.get("page", ["1"])[0])
            runs = [dict(run) for run in self.runs.values()
                    if run["head_sha"] == parts[1] and (name is None or run["name"] == name)]
            if name == rcr.LEDGER_CHECK_NAME and self.fail_ledger_list:
                raise urllib.error.URLError("ledger listing unavailable")
            if self.hide_ledger:
                runs = [run for run in runs if run["name"] != rcr.LEDGER_CHECK_NAME]
            return {"check_runs": runs[(page - 1) * 100: page * 100]}
        raise AssertionError(f"unexpected GET {url}")

    def send_json(self, url, *, token, method, payload):
        parts = urllib.parse.urlsplit(url).path.split("/")[4:]
        if method == "POST" and parts == ["check-runs"]:
            is_ledger = payload["name"] == rcr.LEDGER_CHECK_NAME
            if is_ledger:
                if self.fail_ledger_post:
                    raise urllib.error.URLError("ledger unavailable")
                if self.before_ledger_post:
                    self.before_ledger_post(payload)
            run_id = self.insert_run(
                payload["name"], payload["head_sha"], payload["external_id"],
                payload["status"], payload.get("conclusion"),
                app_id=self.ledger_app_override if (is_ledger and self.ledger_app_override) else APP_ID,
            )
            if is_ledger and self.after_ledger_post:
                self.after_ledger_post(payload)
            return dict(self.runs[run_id])
        if method == "PATCH" and parts[0] == "check-runs":
            run = self.runs[int(parts[1])]
            if run["name"] == rcr.LEDGER_CHECK_NAME and self.fail_ledger_patch:
                raise urllib.error.URLError("ledger update failed")
            run.update(status=payload["status"], conclusion=payload["conclusion"], output=payload["output"])
            if run["name"] == rcr.LEDGER_CHECK_NAME and self.after_ledger_patch:
                self.after_ledger_patch(dict(run))
            return dict(run)
        raise AssertionError(f"unexpected {method} {url}")


class Provider:
    """Local stand-in for the Anthropic call; records every attempted paid call."""

    def __init__(self, *responses):
        self.responses = list(responses)
        self.calls = 0

    def __call__(self, api_key, payload):
        self.calls += 1
        response = self.responses.pop(0) if len(self.responses) > 1 else self.responses[0]
        if callable(response):
            response = response(payload)
        if isinstance(response, BaseException):
            raise response
        return response


def verdict_for(head, **changes):
    return provider_body(pass_payload(reviewed_sha=head, **changes))


class LedgerGateTests(unittest.TestCase):
    def setUp(self):
        self.gh = FakeGitHub()
        self.gh.add_pr(4, HEAD_A)

    def run_gate(self, number, provider, *, enabled="true", policies=None):
        pr = self.gh.prs[number]
        env = {
            "GH_REPO": "owner/repo", "GH_TOKEN": "workflow-token", "CHECKS_TOKEN": "app-token",
            "CLAUDE_REVIEW_APP_ID": str(APP_ID), "PR_NUMBER": str(number),
            "EXPECTED_HEAD": pr["head"], "EXPECTED_BASE": pr["base"],
            "CLAUDE_REVIEW_ENABLED": enabled, "CLAUDE_REVIEW_BUDGET_APPROVED": "true",
            "ANTHROPIC_API_KEY": "test-key", "CLAUDE_MODEL": "test-model",
        }
        policy_patch = (patch.object(rcr, "read_trusted_policies", side_effect=policies)
                        if policies else patch.object(rcr, "read_trusted_policies", return_value="rules"))
        with (
            patch.dict(os.environ, env, clear=True),
            patch.object(rcr, "request_json", self.gh.request_json),
            patch.object(rcr, "send_json", self.gh.send_json),
            patch.object(rcr, "send_to_claude", provider),
            policy_patch,
            contextlib.redirect_stdout(io.StringIO()),
        ):
            return rcr.main()

    def fingerprint(self, number):
        pr = self.gh.prs[number]
        with patch.object(rcr, "request_json", self.gh.request_json):
            _, context, _ = rcr.fetch_pr_and_diff("owner/repo", number, "t", pr["head"], pr["base"])
        return rcr.review_fingerprint(context)

    def ledger_states(self):
        return [(run["status"], run["conclusion"]) for run in self.gh.ledger()]

    # --- first verdict wins ----------------------------------------------
    def test_pass_is_recorded_and_reused_by_another_pr_with_identical_fingerprint(self):
        provider = Provider(verdict_for(HEAD_A))
        self.assertEqual(self.run_gate(4, provider), 0)
        self.assertEqual(self.gh.pr_check(4)["conclusion"], "success")
        self.assertEqual(self.ledger_states(), [("completed", "success")])

        self.gh.add_pr(5, HEAD_B)  # different PR and commit, identical content and base
        self.assertEqual(self.run_gate(5, provider), 0)
        self.assertEqual(provider.calls, 1)
        self.assertEqual(self.gh.pr_check(5)["conclusion"], "success")
        self.assertEqual(len(self.gh.ledger()), 1)

    def test_non_pass_is_sticky_for_reopen_empty_commit_and_new_pr(self):
        provider = Provider(verdict_for(HEAD_A, verdict="FAIL"), verdict_for(HEAD_A))
        self.assertEqual(self.run_gate(4, provider), 1)
        self.assertEqual(self.ledger_states(), [("completed", "failure")])

        self.assertEqual(self.run_gate(4, provider), 1)          # reopen / rerun
        self.gh.prs[4]["head"] = HEAD_C                          # empty commit, same content
        self.assertEqual(self.run_gate(4, provider), 1)
        self.gh.add_pr(5, HEAD_B)                                # new PR, same content
        self.assertEqual(self.run_gate(5, provider), 1)
        self.assertEqual(provider.calls, 1)
        self.assertEqual(self.gh.pr_check(5)["conclusion"], "failure")
        self.assertIn("non-passing", self.gh.pr_check(5)["output"]["summary"])

    def test_changed_content_creates_a_new_fingerprint_and_evaluation(self):
        provider = Provider(verdict_for(HEAD_A, verdict="FAIL"), verdict_for(HEAD_B))
        self.assertEqual(self.run_gate(4, provider), 1)
        self.gh.add_pr(5, HEAD_B, content={"src/app.py": "x\ny\n\n"})
        self.assertEqual(self.run_gate(5, provider), 0)  # documented residual risk
        self.assertEqual(provider.calls, 2)

    def test_unresolved_or_unknown_entries_block_without_a_paid_call(self):
        external_id = rcr.ledger_external_id(self.fingerprint(4))
        for status, conclusion in (("in_progress", None), ("queued", None), ("completed", "stale")):
            with self.subTest(status=status, conclusion=conclusion):
                self.setUp()
                self.gh.insert_run(rcr.LEDGER_CHECK_NAME, BASE, external_id, status, conclusion)
                provider = Provider(verdict_for(HEAD_A))
                self.assertEqual(self.run_gate(4, provider), 1)
                self.assertEqual(provider.calls, 0)
                self.assertEqual(self.gh.pr_check(4)["conclusion"], "failure")

    def test_ledger_entries_of_other_apps_are_ignored(self):
        external_id = rcr.ledger_external_id(self.fingerprint(4))
        self.gh.insert_run(rcr.LEDGER_CHECK_NAME, BASE, external_id, "completed", "failure", app_id=999)
        provider = Provider(verdict_for(HEAD_A))
        self.assertEqual(self.run_gate(4, provider), 0)
        self.assertEqual(provider.calls, 1)

    # --- parallel and concurrent evaluations --------------------------------
    def test_parallel_identical_pr_is_blocked_while_first_evaluation_runs(self):
        self.gh.add_pr(5, HEAD_B)
        inner = Provider(verdict_for(HEAD_B))
        inner_result = {}

        def first_evaluation(payload):
            inner_result["code"] = self.run_gate(5, inner)
            return verdict_for(HEAD_A, verdict="FAIL")

        self.assertEqual(self.run_gate(4, Provider(first_evaluation)), 1)
        self.assertEqual(inner_result["code"], 1)
        self.assertEqual(inner.calls, 0)
        self.assertIn("unresolved", self.gh.pr_check(5)["output"]["summary"])
        self.assertEqual(self.ledger_states(), [("completed", "failure")])
        self.assertEqual(self.run_gate(5, inner), 1)  # rerun after the first verdict
        self.assertEqual(inner.calls, 0)

    def test_parallel_identical_pr_reuses_first_pass_after_it_completes(self):
        self.gh.add_pr(5, HEAD_B)
        inner = Provider(verdict_for(HEAD_B, verdict="FAIL"))

        def first_evaluation(payload):
            self.assertEqual(self.run_gate(5, inner), 1)
            return verdict_for(HEAD_A)

        self.assertEqual(self.run_gate(4, Provider(first_evaluation)), 0)
        self.assertEqual(self.run_gate(5, inner), 0)
        self.assertEqual(inner.calls, 0)

    def test_simultaneous_claims_earliest_claim_wins(self):
        def competing_claim(payload):
            self.gh.insert_run(rcr.LEDGER_CHECK_NAME, BASE, payload["external_id"], "in_progress")

        self.gh.before_ledger_post = competing_claim  # competitor claims first (lower id)
        provider = Provider(verdict_for(HEAD_A))
        self.assertEqual(self.run_gate(4, provider), 1)
        self.assertEqual(provider.calls, 0)
        own = max(self.gh.ledger(), key=lambda run: run["id"])
        self.assertEqual((own["status"], own["conclusion"]), ("completed", "neutral"))
        self.assertIn("takes precedence", self.gh.pr_check(4)["output"]["summary"])

    def test_later_competing_claim_wins_no_verdict_and_blocks_pr_pass_until_resolved(self):
        later = {}

        def later_claim(payload):
            later["id"] = self.gh.insert_run(rcr.LEDGER_CHECK_NAME, BASE, payload["external_id"], "in_progress")

        self.gh.after_ledger_post = later_claim
        provider = Provider(verdict_for(HEAD_A))
        # The earlier claim still wins arbitration and records the first verdict ...
        self.assertEqual(self.run_gate(4, provider), 1)
        self.assertEqual(provider.calls, 1)
        own = min(self.gh.ledger(), key=lambda run: run["id"])
        self.assertEqual((own["status"], own["conclusion"]), ("completed", "success"))
        # ... but the unresolved later claim keeps the PR check fail-closed.
        self.assertEqual(self.gh.pr_check(4)["conclusion"], "failure")
        self.gh.after_ledger_post = None
        self.gh.runs[later["id"]].update(status="completed", conclusion="neutral")
        self.assertEqual(self.run_gate(4, provider), 0)
        self.assertEqual(provider.calls, 1)

    # --- final recheck immediately before a PR PASS ---------------------------
    def test_entry_added_after_pass_finalization_prevents_pr_pass(self):
        for status, conclusion in (("completed", "failure"), ("completed", "stale"),
                                   ("in_progress", None), ("queued", None),
                                   ("completed", "success")):
            with self.subTest(status=status, conclusion=conclusion):
                self.setUp()

                def inject(run, status=status, conclusion=conclusion):
                    if run["conclusion"] == "success":
                        self.gh.after_ledger_patch = None
                        self.gh.insert_run(rcr.LEDGER_CHECK_NAME, BASE, run["external_id"], status, conclusion)

                self.gh.after_ledger_patch = inject
                provider = Provider(verdict_for(HEAD_A))
                self.assertEqual(self.run_gate(4, provider), 1)
                self.assertEqual(self.gh.pr_check(4)["conclusion"], "failure")
                self.assertNotEqual(self.gh.pr_check(4)["conclusion"], "success")

    def test_unavailable_ledger_recheck_never_produces_pr_pass(self):
        def break_listing(run):
            if run["conclusion"] == "success":
                self.gh.fail_ledger_list = True

        self.gh.after_ledger_patch = break_listing
        self.assertEqual(self.run_gate(4, Provider(verdict_for(HEAD_A))), 1)
        self.assertEqual(self.gh.pr_check(4)["conclusion"], "failure")

    def test_revisions_moving_after_ledger_recheck_prevent_pr_pass(self):
        for moved in ("main", "head", "base"):
            with self.subTest(moved=moved):
                self.setUp()

                def move(run, moved=moved):
                    if run["conclusion"] != "success":
                        return
                    if moved == "main":
                        self.gh.main = HEAD_C
                    elif moved == "head":
                        self.gh.prs[4]["head"] = HEAD_C
                    else:
                        self.gh.prs[4]["base"] = HEAD_C

                self.gh.after_ledger_patch = move
                self.assertEqual(self.run_gate(4, Provider(verdict_for(HEAD_A))), 1)
                checks = self.gh.runs_named(rcr.PR_CHECK_NAME, HEAD_A)
                self.assertEqual([run["conclusion"] for run in checks], ["failure"])

    def test_reused_pass_is_rejected_when_ledger_gains_another_entry(self):
        provider = Provider(verdict_for(HEAD_A))
        self.assertEqual(self.run_gate(4, provider), 0)
        external_id = rcr.ledger_external_id(self.fingerprint(4))
        self.gh.add_pr(5, HEAD_B)
        for status, conclusion in (("in_progress", None), ("completed", "success")):
            with self.subTest(status=status, conclusion=conclusion):
                run_id = self.gh.insert_run(rcr.LEDGER_CHECK_NAME, BASE, external_id, status, conclusion)
                self.assertEqual(self.run_gate(5, provider), 1)
                self.assertEqual(self.gh.pr_check(5)["conclusion"], "failure")
                del self.gh.runs[run_id]
        self.assertEqual(self.run_gate(5, provider), 0)
        self.assertEqual(provider.calls, 1)

    # --- provider response size --------------------------------------------------
    def padded_body(self, size, head=HEAD_A):
        body = verdict_for(head)
        self.assertLessEqual(len(body), size)
        return body + b" " * (size - len(body))  # valid JSON with trailing whitespace

    def test_response_exactly_at_limit_is_accepted(self):
        body = self.padded_body(rcr.MAX_PROVIDER_RESPONSE_BYTES)
        self.assertEqual(self.run_gate(4, Provider(body)), 0)
        self.assertEqual(self.ledger_states(), [("completed", "success")])

    def test_response_over_limit_is_a_sticky_non_pass(self):
        body = self.padded_body(rcr.MAX_PROVIDER_RESPONSE_BYTES + 1)
        provider = Provider(body, verdict_for(HEAD_A))
        self.assertEqual(self.run_gate(4, provider), 1)
        self.assertEqual(self.ledger_states(), [("completed", "failure")])
        self.assertNotIn("retry is allowed", self.gh.pr_check(4)["output"]["summary"])
        self.assertEqual(self.run_gate(4, provider), 1)
        self.assertEqual(provider.calls, 1)

    def test_real_read_detects_oversized_body_and_blocks(self):
        oversized = self.padded_body(rcr.MAX_PROVIDER_RESPONSE_BYTES * 2)
        reads = []

        class Response:
            def __enter__(self):
                return self

            def __exit__(self, *args):
                return False

            def read(self, limit=None):
                reads.append(limit)
                return oversized if limit is None else oversized[:limit]

        pr = self.gh.prs[4]
        env = {
            "GH_REPO": "owner/repo", "GH_TOKEN": "t", "CHECKS_TOKEN": "a", "CLAUDE_REVIEW_APP_ID": str(APP_ID),
            "PR_NUMBER": "4", "EXPECTED_HEAD": pr["head"], "EXPECTED_BASE": pr["base"],
            "CLAUDE_REVIEW_ENABLED": "true", "CLAUDE_REVIEW_BUDGET_APPROVED": "true",
            "ANTHROPIC_API_KEY": "k",
        }
        with (
            patch.dict(os.environ, env, clear=True),
            patch.object(rcr, "request_json", self.gh.request_json),
            patch.object(rcr, "send_json", self.gh.send_json),
            patch.object(rcr, "read_trusted_policies", return_value="rules"),
            patch("scripts.run_claude_review.open_url", return_value=Response()),
            contextlib.redirect_stdout(io.StringIO()),
        ):
            self.assertEqual(rcr.main(), 1)
        self.assertEqual(reads, [rcr.MAX_PROVIDER_RESPONSE_BYTES + 1])
        self.assertEqual(self.ledger_states(), [("completed", "failure")])
        self.assertEqual(self.gh.pr_check(4)["conclusion"], "failure")

    def test_failure_recorded_during_evaluation_prevents_pass(self):
        def evaluation(payload):
            external_id = rcr.ledger_external_id(self.fingerprint(4))
            self.gh.insert_run(rcr.LEDGER_CHECK_NAME, BASE, external_id, "completed", "failure")
            return verdict_for(HEAD_A)

        self.assertEqual(self.run_gate(4, Provider(evaluation)), 1)
        self.assertEqual(self.gh.pr_check(4)["conclusion"], "failure")
        self.assertNotIn(("completed", "success"), self.ledger_states())

    # --- provider outcomes ----------------------------------------------------
    def test_unusable_provider_responses_are_recorded_as_sticky_non_pass(self):
        cases = {
            "refusal": provider_body(pass_payload(reviewed_sha=HEAD_A), stop_reason="refusal"),
            "max_tokens": provider_body(pass_payload(reviewed_sha=HEAD_A), stop_reason="max_tokens"),
            "invalid_json": b"{not json",
            "wrong_shape": b"[]",
            "ambiguous": provider_body(content=[
                {"type": "text", "text": json.dumps(pass_payload(reviewed_sha=HEAD_A))},
                {"type": "text", "text": json.dumps(pass_payload(reviewed_sha=HEAD_A))},
            ]),
            "missing_block": provider_body(content=[]),
            "inconclusive": verdict_for(HEAD_A, verdict="INCONCLUSIVE"),
            "wrong_sha": verdict_for(HEAD_B),
            "pass_with_findings": verdict_for(HEAD_A, findings=[
                {"severity": "low", "file": "src/app.py", "line": 1, "description": "x"}]),
        }
        for name, body in cases.items():
            with self.subTest(case=name):
                self.setUp()
                provider = Provider(body, verdict_for(HEAD_A))
                self.assertEqual(self.run_gate(4, provider), 1)
                self.assertEqual(self.ledger_states(), [("completed", "failure")])
                self.assertEqual(self.gh.pr_check(4)["conclusion"], "failure")
                self.assertEqual(self.run_gate(4, provider), 1)
                self.assertEqual(provider.calls, 1)

    def test_transport_failure_releases_claim_and_retry_can_pass(self):
        provider = Provider(rcr.ProviderTransportError("timeout"), verdict_for(HEAD_A))
        self.assertEqual(self.run_gate(4, provider), 1)
        self.assertEqual(self.ledger_states(), [("completed", "neutral")])
        self.assertIn("retry is allowed", self.gh.pr_check(4)["output"]["summary"])
        self.assertEqual(self.run_gate(4, provider), 0)
        self.assertEqual(provider.calls, 2)

    def test_real_transport_errors_are_classified_as_retryable(self):
        def raising_urlopen(*args, **kwargs):
            raise urllib.error.HTTPError("https://api.anthropic.com", 529, "overloaded", {}, None)

        pr = self.gh.prs[4]
        env = {
            "GH_REPO": "owner/repo", "GH_TOKEN": "t", "CHECKS_TOKEN": "a", "CLAUDE_REVIEW_APP_ID": str(APP_ID),
            "PR_NUMBER": "4", "EXPECTED_HEAD": pr["head"], "EXPECTED_BASE": pr["base"],
            "CLAUDE_REVIEW_ENABLED": "true", "CLAUDE_REVIEW_BUDGET_APPROVED": "true",
            "ANTHROPIC_API_KEY": "k",
        }
        with (
            patch.dict(os.environ, env, clear=True),
            patch.object(rcr, "request_json", self.gh.request_json),
            patch.object(rcr, "send_json", self.gh.send_json),
            patch.object(rcr, "read_trusted_policies", return_value="rules"),
            patch("scripts.run_claude_review.open_url", raising_urlopen),
            contextlib.redirect_stdout(io.StringIO()),
        ):
            self.assertEqual(rcr.main(), 1)
        self.assertEqual(self.ledger_states(), [("completed", "neutral")])

    # --- real send_to_claude: errors before vs. after a successful response -----
    def run_with_urlopen(self, urlopen):
        pr = self.gh.prs[4]
        env = {
            "GH_REPO": "owner/repo", "GH_TOKEN": "t", "CHECKS_TOKEN": "a", "CLAUDE_REVIEW_APP_ID": str(APP_ID),
            "PR_NUMBER": "4", "EXPECTED_HEAD": pr["head"], "EXPECTED_BASE": pr["base"],
            "CLAUDE_REVIEW_ENABLED": "true", "CLAUDE_REVIEW_BUDGET_APPROVED": "true",
            "ANTHROPIC_API_KEY": "k",
        }
        with (
            patch.dict(os.environ, env, clear=True),
            patch.object(rcr, "request_json", self.gh.request_json),
            patch.object(rcr, "send_json", self.gh.send_json),
            patch.object(rcr, "read_trusted_policies", return_value="rules"),
            patch("scripts.run_claude_review.open_url", urlopen),
            contextlib.redirect_stdout(io.StringIO()),
        ):
            return rcr.main()

    class Opener:
        """urlopen stand-in: each call consumes one scripted outcome."""

        def __init__(self, *outcomes):
            self.outcomes = list(outcomes)
            self.calls = 0

        def __call__(self, request, timeout=None):
            self.calls += 1
            outcome = self.outcomes.pop(0)
            if isinstance(outcome, BaseException):
                raise outcome  # failure before any successful response
            return outcome

    class Response:
        def __init__(self, body=b"", read_error=None):
            self.body = body
            self.read_error = read_error

        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

        def read(self, limit=None):
            if self.read_error is not None:
                raise self.read_error
            return self.body if limit is None else self.body[:limit]

    def test_failures_before_a_successful_response_stay_retryable(self):
        before = (
            urllib.error.URLError("connection refused"),
            TimeoutError("connect timed out"),
            urllib.error.HTTPError("https://api.anthropic.com", 529, "overloaded", {}, None),
        )
        for error in before:
            with self.subTest(error=repr(error)):
                self.setUp()
                opener = self.Opener(error, self.Response(verdict_for(HEAD_A)))
                self.assertEqual(self.run_with_urlopen(opener), 1)
                self.assertEqual(self.ledger_states(), [("completed", "neutral")])
                self.assertIn("retry is allowed", self.gh.pr_check(4)["output"]["summary"])
                self.assertEqual(self.run_with_urlopen(opener), 0)
                self.assertEqual(opener.calls, 2)

    def test_read_failures_after_successful_response_are_sticky(self):
        during = (
            http.client.IncompleteRead(b'{"stop_reason":"end_turn","content":[', 5000),
            http.client.IncompleteRead(b"", None),
            TimeoutError("read timed out"),
        )
        for error in during:
            with self.subTest(error=repr(error)):
                self.setUp()
                opener = self.Opener(self.Response(read_error=error), self.Response(verdict_for(HEAD_A)))
                self.assertEqual(self.run_with_urlopen(opener), 1)
                self.assertEqual(self.ledger_states(), [("completed", "failure")])
                summary = self.gh.pr_check(4)["output"]["summary"]
                self.assertNotIn("retry is allowed", summary)
                self.assertIn("recorded as non-passing", summary)
                # Second run: blocked by the ledger, no further model request.
                self.assertEqual(self.run_with_urlopen(opener), 1)
                self.assertEqual(opener.calls, 1)
                self.assertEqual(self.gh.pr_check(4)["conclusion"], "failure")

    def test_oversized_body_via_real_read_stays_sticky(self):
        oversized = verdict_for(HEAD_A) + b" " * (rcr.MAX_PROVIDER_RESPONSE_BYTES * 2)
        opener = self.Opener(self.Response(oversized), self.Response(verdict_for(HEAD_A)))
        self.assertEqual(self.run_with_urlopen(opener), 1)
        self.assertEqual(self.ledger_states(), [("completed", "failure")])
        self.assertEqual(self.run_with_urlopen(opener), 1)
        self.assertEqual(opener.calls, 1)

    def test_exception_after_model_call_started_is_sticky(self):
        provider = Provider(verdict_for(HEAD_A))
        with patch.object(rcr, "validate", side_effect=RuntimeError("validator crashed")):
            self.assertEqual(self.run_gate(4, provider), 1)
        self.assertEqual(self.ledger_states(), [("completed", "failure")])
        self.assertEqual(self.run_gate(4, provider), 1)
        self.assertEqual(provider.calls, 1)

    def test_exception_before_model_call_releases_claim(self):
        provider = Provider(verdict_for(HEAD_A))
        self.assertEqual(self.run_gate(4, provider, policies=OSError("policy unreadable")), 1)
        self.assertEqual(provider.calls, 0)
        self.assertEqual(self.ledger_states(), [("completed", "neutral")])
        self.assertEqual(self.run_gate(4, provider), 0)

    # --- ledger failures stay fail-closed ------------------------------------
    def test_failed_ledger_finalization_keeps_fingerprint_blocked(self):
        for first in (verdict_for(HEAD_A, verdict="FAIL"), rcr.ProviderTransportError("x"), verdict_for(HEAD_A)):
            with self.subTest(first=type(first).__name__):
                self.setUp()
                provider = Provider(first, verdict_for(HEAD_A))
                self.gh.fail_ledger_patch = True
                self.assertEqual(self.run_gate(4, provider), 1)
                self.assertEqual(self.gh.pr_check(4)["conclusion"], "failure")
                self.assertEqual(self.ledger_states(), [("in_progress", None)])
                self.gh.fail_ledger_patch = False
                self.assertEqual(self.run_gate(4, provider), 1)
                self.assertEqual(provider.calls, 1)

    def test_claim_that_cannot_be_proven_prevents_any_paid_call(self):
        for setup in ("post_fails", "foreign_app", "invisible"):
            with self.subTest(setup=setup):
                self.setUp()
                if setup == "post_fails":
                    self.gh.fail_ledger_post = True
                elif setup == "foreign_app":
                    self.gh.ledger_app_override = 999
                else:
                    self.gh.hide_ledger = True
                provider = Provider(verdict_for(HEAD_A))
                self.assertEqual(self.run_gate(4, provider), 1)
                self.assertEqual(provider.calls, 0)
                self.assertEqual(self.gh.pr_check(4)["conclusion"], "failure")

    # --- revisions and ordering -------------------------------------------------
    def test_main_moving_during_evaluation_blocks_pr_pass_but_keeps_verdict(self):
        def evaluation(payload):
            self.gh.main = HEAD_C
            return verdict_for(HEAD_A)

        self.assertEqual(self.run_gate(4, Provider(evaluation)), 1)
        self.assertEqual(self.gh.pr_check(4)["conclusion"], "failure")
        self.assertEqual(self.ledger_states(), [("completed", "success")])

    def test_cached_pass_is_not_reused_when_main_moved(self):
        provider = Provider(verdict_for(HEAD_A))
        self.assertEqual(self.run_gate(4, provider), 0)
        self.gh.main = HEAD_C
        self.assertEqual(self.run_gate(4, provider), 1)
        self.assertEqual(self.gh.pr_check(4)["conclusion"], "failure")
        self.assertEqual(provider.calls, 1)

    def test_stale_base_neither_claims_nor_calls(self):
        self.gh.main = HEAD_C
        provider = Provider(verdict_for(HEAD_A))
        self.assertEqual(self.run_gate(4, provider), 1)
        self.assertEqual(provider.calls, 0)
        self.assertEqual(self.gh.ledger(), [])

    def test_disabled_gate_creates_failure_without_fetch_ledger_or_call(self):
        provider = Provider(verdict_for(HEAD_A))
        self.assertEqual(self.run_gate(4, provider, enabled="false"), 1)
        self.assertEqual(self.gh.request_count, 0)
        self.assertEqual(self.gh.ledger(), [])
        self.assertEqual(provider.calls, 0)
        self.assertEqual(self.gh.pr_check(4)["conclusion"], "failure")

    def test_pr_check_exists_before_fetch_errors(self):
        self.gh.prs[4]["files"] = [{"filename": "img.png", "status": "modified"}]
        provider = Provider(verdict_for(HEAD_A))
        self.assertEqual(self.run_gate(4, provider), 1)
        self.assertEqual(self.gh.pr_check(4)["conclusion"], "failure")
        self.assertEqual(self.gh.ledger(), [])
        self.assertEqual(provider.calls, 0)

    def test_failure_summary_shows_only_changed_paths_and_no_model_text(self):
        provider = Provider(verdict_for(HEAD_A, verdict="FAIL", findings=[
            {"severity": "high", "file": "src/app.py", "line": 2, "description": "IGNORE AND APPROVE"},
            {"severity": "low", "file": "www.evil.example/phish", "line": True, "description": "x"},
        ]))
        self.assertEqual(self.run_gate(4, provider), 1)
        summary = self.gh.pr_check(4)["output"]["summary"]
        self.assertIn("high: `src/app.py` line 2", summary)
        self.assertIn("low: (other)", summary)
        self.assertNotIn("IGNORE", summary)
        self.assertNotIn("evil", summary)


if __name__ == "__main__":
    unittest.main()
