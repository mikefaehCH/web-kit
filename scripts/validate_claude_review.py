#!/usr/bin/env python3
"""Fail-closed validation of a structured independent review verdict."""
import json
import re
import sys

def validate(payload, expected_sha):
    if not re.fullmatch(r"[0-9a-f]{40}", expected_sha):
        return False
    if not isinstance(payload, dict) or set(payload) != {"verdict", "head_sha", "findings"}:
        return False
    if payload["verdict"] != "PASS" or payload["head_sha"] != expected_sha:
        return False
    if not isinstance(payload["findings"], list) or payload["findings"]:
        return False
    return True

if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit("usage: validate_claude_review.py verdict.json expected_sha")
    try:
        with open(sys.argv[1], encoding="utf-8") as file:
            result = json.load(file)
        valid = validate(result, sys.argv[2])
    except (OSError, ValueError, TypeError):
        valid = False
    print("PASS" if valid else "FAIL")
    sys.exit(0 if valid else 1)
