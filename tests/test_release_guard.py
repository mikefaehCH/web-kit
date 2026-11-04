"""Exercise the merge runner's jq guards using real jq and synthetic GitHub responses."""
import json
import pathlib
import re
import subprocess
import unittest
import os
import tempfile

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
    def test_post_merge_dispatch_success_and_failures(self):
        text = WORKFLOW.read_text()
        body = text.split('        run: |\n', 1)[1]
        script = '\n'.join(line[10:] for line in body.splitlines())
        mock = '''#!/usr/bin/env python3
import json, os, sys
args = sys.argv[1:]
with open(os.environ['CALL_LOG'], 'a') as log:
    log.write(json.dumps(args) + '\\n')
if args[:2] == ['workflow', 'run']:
    sys.exit(1 if os.environ['MODE'] == 'dispatch-fails' else 0)
endpoint = next((a for a in args if a.startswith('repos/')), '')
if endpoint.endswith('/pulls'):
    print('1')
elif endpoint.endswith('/pulls/1'):
    print(json.dumps({'state':'open','draft':False,'base':{'ref':'main','repo':{'full_name':'example/repo'}},'head':{'sha':os.environ['RUN_SHA'],'repo':{'full_name':'example/repo'}},'body':'Autonomy-Release: true'}))
elif '/files?' in endpoint:
    print(json.dumps([[{'filename':'README.md','status':'modified'}]]))
elif '/reviews?' in endpoint:
    print('[[]]')
elif endpoint.endswith('/merge'):
    if os.environ['MODE'] == 'merge-fails': sys.exit(1)
    print(json.dumps({'merged':os.environ['MODE'] != 'not-merged','sha':'a'*40}))
else:
    sys.exit(2)
'''
        for mode in ['success', 'merge-fails', 'not-merged', 'dispatch-fails']:
            with self.subTest(mode=mode), tempfile.TemporaryDirectory() as directory:
                root = pathlib.Path(directory)
                executable = root / 'gh'
                executable.write_text(mock)
                executable.chmod(0o755)
                log = root / 'calls.jsonl'
                env = dict(os.environ, PATH=directory + os.pathsep + os.environ['PATH'],
                           MODE=mode, CALL_LOG=str(log), RUN_SHA='b'*40,
                           GH_REPO='example/repo')
                result = subprocess.run(['bash', '-c', script], cwd=directory, env=env,
                                        capture_output=True, text=True)
                calls = [json.loads(line) for line in log.read_text().splitlines()]
                dispatches = [call for call in calls if call[:2] == ['workflow', 'run']]
                if mode == 'success':
                    self.assertEqual(result.returncode, 0, result.stderr)
                    self.assertEqual(dispatches, [
                        ['workflow', 'run', 'quality.yml', '--ref', 'main'],
                        ['workflow', 'run', 'whatsapp-check.yml', '--ref', 'main']])
                else:
                    self.assertNotEqual(result.returncode, 0)
                    self.assertEqual(len(dispatches), 1 if mode == 'dispatch-fails' else 0)

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
