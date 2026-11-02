"""Credentialed requests never follow HTTP redirects.

A real local HTTP server answers with 3xx and records every request, so the
tests prove that the redirect target is never contacted and that no
Authorization or x-api-key header leaves for it. No external network access.
"""

import contextlib
import http.server
import io
import json
import os
import threading
import unittest
import urllib.error
import urllib.request
from unittest.mock import patch

from scripts import run_claude_review as rcr
from test_claude_ledger import APP_ID, BASE, HEAD_A, FakeGitHub, verdict_for

REDIRECT_CODES = (301, 302, 303)


class RecordingServer:
    """Answers /start/<code> with a redirect to /target; records all requests."""

    def __init__(self):
        self.requests = []
        recorder = self.requests

        class Handler(http.server.BaseHTTPRequestHandler):
            def log_message(self, *args):
                pass

            def _handle(self):
                length = int(self.headers.get("Content-Length") or 0)
                if length:
                    self.rfile.read(length)
                recorder.append({
                    "method": self.command,
                    "path": self.path,
                    "authorization": self.headers.get("Authorization"),
                    "api_key": self.headers.get("x-api-key"),
                })
                if self.path.startswith("/start/"):
                    code = int(self.path.rsplit("/", 1)[1])
                    self.send_response(code)
                    self.send_header("Location", f"http://127.0.0.1:{self.server.server_port}/target")
                    self.send_header("Content-Length", "0")
                    self.end_headers()
                    return
                body = json.dumps(verdict_body()).encode()
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)

            do_GET = do_POST = do_PATCH = do_HEAD = _handle

        self.httpd = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        self.thread = threading.Thread(target=self.httpd.serve_forever, daemon=True)

    def url(self, path):
        return f"http://127.0.0.1:{self.httpd.server_port}{path}"

    def target_hits(self):
        return [entry for entry in self.requests if entry["path"] == "/target"]

    def __enter__(self):
        self.thread.start()
        return self

    def __exit__(self, *args):
        self.httpd.shutdown()
        self.httpd.server_close()
        self.thread.join(timeout=5)


def verdict_body():
    # A PASS-shaped provider body: if a redirect were followed, this would be
    # what an attacker-controlled target could return.
    return json.loads(verdict_for(HEAD_A))


class RedirectRefusalTests(unittest.TestCase):
    def setUp(self):
        # Make sure local requests never go through an environment proxy.
        patcher = patch.dict(os.environ, {"no_proxy": "127.0.0.1,localhost", "NO_PROXY": "127.0.0.1,localhost"})
        patcher.start()
        self.addCleanup(patcher.stop)

    def test_control_default_urllib_would_follow_and_leak_the_header(self):
        """Sanity check of the test server: plain urllib follows and forwards credentials."""
        with RecordingServer() as server:
            request = urllib.request.Request(server.url("/start/302"),
                                             headers={"Authorization": "Bearer secret"})
            opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
            with opener.open(request, timeout=5) as response:
                response.read()
            hits = server.target_hits()
        self.assertEqual(len(hits), 1)
        self.assertEqual(hits[0]["authorization"], "Bearer secret")

    def test_request_json_refuses_redirects_without_contacting_the_target(self):
        for code in REDIRECT_CODES + (307, 308):
            with self.subTest(code=code), RecordingServer() as server:
                with self.assertRaises(rcr.RedirectRefused) as raised:
                    rcr.request_json(server.url(f"/start/{code}"), token="gh-secret")
                self.assertEqual(raised.exception.code, code)
                self.assertIsInstance(raised.exception, urllib.error.HTTPError)
                self.assertEqual(server.target_hits(), [])
                self.assertEqual([entry["path"] for entry in server.requests], [f"/start/{code}"])

    def test_send_json_refuses_redirects_for_post_and_patch(self):
        for method in ("POST", "PATCH"):
            for code in REDIRECT_CODES:
                with self.subTest(method=method, code=code), RecordingServer() as server:
                    with self.assertRaises(rcr.RedirectRefused):
                        rcr.send_json(server.url(f"/start/{code}"), token="gh-secret",
                                      method=method, payload={"name": "Claude review"})
                    self.assertEqual(server.target_hits(), [])
                    self.assertEqual(len(server.requests), 1)
                    self.assertEqual(server.requests[0]["authorization"], "Bearer gh-secret")

    def test_send_to_claude_refuses_redirects_and_never_forwards_the_api_key(self):
        for code in REDIRECT_CODES:
            with self.subTest(code=code), RecordingServer() as server:
                with patch.object(rcr, "ANTHROPIC_MESSAGES", server.url(f"/start/{code}")):
                    with self.assertRaises(rcr.ProviderTransportError) as raised:
                        rcr.send_to_claude("anthropic-secret", {"model": "m"})
                self.assertIsInstance(raised.exception.__cause__, rcr.RedirectRefused)
                self.assertEqual(server.target_hits(), [])
                self.assertEqual(len(server.requests), 1)
                self.assertEqual(server.requests[0]["api_key"], "anthropic-secret")

    def test_unhandled_3xx_status_is_never_returned(self):
        class FakeResponse:
            status = 304
            headers = {}

            def __init__(self):
                self.closed = False

            def close(self):
                self.closed = True

        response = FakeResponse()
        with patch.object(rcr._CREDENTIALED_OPENER, "open", return_value=response):
            with self.assertRaises(rcr.RedirectRefused):
                rcr.open_url(urllib.request.Request("https://api.github.com/x"), timeout=1)
        self.assertTrue(response.closed)

    def test_credentialed_opener_has_no_following_redirect_handler(self):
        handlers = [type(handler) for handler in rcr._CREDENTIALED_OPENER.handlers]
        self.assertIn(rcr._NoRedirectHandler, handlers)
        self.assertNotIn(urllib.request.HTTPRedirectHandler, handlers)
        source = open(rcr.__file__, encoding="utf-8").read()
        self.assertNotIn("urllib.request.urlopen(", source)

    def test_provider_redirect_in_gate_is_retryable_and_never_passes(self):
        gh = FakeGitHub()
        gh.add_pr(4, HEAD_A)
        env = {
            "GH_REPO": "owner/repo", "GH_TOKEN": "t", "CHECKS_TOKEN": "a", "CLAUDE_REVIEW_APP_ID": str(APP_ID),
            "PR_NUMBER": "4", "EXPECTED_HEAD": HEAD_A, "EXPECTED_BASE": BASE,
            "CLAUDE_REVIEW_ENABLED": "true", "CLAUDE_REVIEW_BUDGET_APPROVED": "true",
            "ANTHROPIC_API_KEY": "anthropic-secret",
            "no_proxy": "127.0.0.1,localhost", "NO_PROXY": "127.0.0.1,localhost",
        }
        with RecordingServer() as server:
            with (
                patch.dict(os.environ, env, clear=True),
                patch.object(rcr, "request_json", gh.request_json),
                patch.object(rcr, "send_json", gh.send_json),
                patch.object(rcr, "read_trusted_policies", return_value="rules"),
                patch.object(rcr, "ANTHROPIC_MESSAGES", server.url("/start/302")),
                contextlib.redirect_stdout(io.StringIO()),
            ):
                self.assertEqual(rcr.main(), 1)
            self.assertEqual(server.target_hits(), [])
        self.assertEqual(gh.pr_check(4)["conclusion"], "failure")
        self.assertEqual([(run["status"], run["conclusion"]) for run in gh.ledger()],
                         [("completed", "neutral")])


if __name__ == "__main__":
    unittest.main()
