"""Exercise the merge runner's jq guards using real jq and synthetic GitHub responses."""
import json
import pathlib
import re
import subprocess
import unittest

WORKFLOW = pathlib.Path(".github/workflows/autonomous-merge.yml")

def guard(file_name, data):
    text = WORKFLOW.read_text()
    match = re.search(r"jq -e '([^']+)' " + re.escape(file_name), text)
    if not match:
        raise AssertionError("guard not found: " + file_name)
    result = subprocess.run(["jq", "-e", match.group(1)], input=json.dumps(data),
                            text=True, capture_output=True, check=False)
    if result.returncode not in (0, 1):
        raise AssertionError(result.stderr)
    return result.returncode == 0

def file(path, status="modified"):
    return {"filename": path, "status": status}

def review(login, state):
    return {"user": {"login": login}, "state": state}

class MergeGuardTests(unittest.TestCase):
    def test_permitted_and_forbidden_paths(self):
        for pages, expected in [
            ([[]], False), ([[file("README.md")]], True),
            ([[file("README.md", "added")]], True),
            ([[file("README.md", "renamed")]], False),
            ([[file("README.md", "removed")]], False),
            ([[file(".github/workflows/autonomous-merge.yml")]], False),
            ([[file("README.md")], [file("supabase/migrations/x.sql")]], False),
            ([[file("admin/auth.js")]], False),
        ]:
            with self.subTest(pages=pages):
                self.assertEqual(guard("files.json", pages), expected)

    def test_review_states_and_pagination(self):
        for pages, expected in [
            ([[]], True),
            ([[review("a", "CHANGES_REQUESTED")]], False),
            ([[review("a", "CHANGES_REQUESTED"), review("a", "COMMENTED")]], False),
            ([[review("a", "CHANGES_REQUESTED")], [review("a", "APPROVED")]], True),
            ([[review("a", "APPROVED"), review("b", "CHANGES_REQUESTED")]], False),
            ([[review("a", "DISMISSED")]], True),
        ]:
            with self.subTest(pages=pages):
                self.assertEqual(guard("reviews.json", pages), expected)

if __name__ == "__main__":
    unittest.main()
