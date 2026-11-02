#!/usr/bin/env python3
"""Fail-closed validation for the Claude review gate's structured verdict."""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from typing import Any

SHA_RE = re.compile(r"^[0-9a-f]{40}$")
VERDICTS = {"PASS", "FAIL", "INCONCLUSIVE"}
TOP_LEVEL_KEYS = {"verdict", "reviewed_sha", "summary", "findings", "security_findings"}


def validate(payload: Any, expected_sha: str, *, provider_outcome: str = "success") -> bool:
    """Accept only a complete PASS for this exact SHA and successful provider run."""
    if provider_outcome != "success" or not isinstance(expected_sha, str):
        return False
    if not SHA_RE.fullmatch(expected_sha):
        return False
    if not isinstance(payload, dict) or set(payload) != TOP_LEVEL_KEYS:
        return False
    if not isinstance(payload["verdict"], str) or payload["verdict"] not in VERDICTS:
        return False
    if payload["verdict"] != "PASS":
        return False
    if payload["reviewed_sha"] != expected_sha:
        return False
    if not isinstance(payload["summary"], str) or not payload["summary"].strip():
        return False
    # PASS cannot coexist with any reported finding, security-related or otherwise.
    if payload["findings"] != [] or payload["security_findings"] != []:
        return False
    return True


def main(argv: list[str]) -> int:
    if len(argv) != 4:
        print("FAIL")
        return 1
    verdict_path, expected_sha, provider_outcome = argv[1:]
    try:
        payload = json.loads(Path(verdict_path).read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError):
        payload = None
    passed = validate(payload, expected_sha, provider_outcome=provider_outcome)
    # Deliberately do not print model output or findings to CI logs.
    print("PASS" if passed else "FAIL")
    return 0 if passed else 1


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
