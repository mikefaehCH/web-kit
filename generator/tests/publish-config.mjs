import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

const read = (path) => readFile(new URL(path, new URL('../', import.meta.url)), 'utf8');

test('wizard opens only the public issue form and does not put site data in the URL', async () => {
  const html = await read('admin/index.html');
  assert.match(
    html,
    /href="https:\/\/github\.com\/mikefaehCH\/web-kit\/issues\/new\?template=web-kit-site-request\.yml"/,
  );
  assert.match(html, /target="_blank"\s+rel="noopener noreferrer"/);
  assert.match(html, /GitHub-Issue vorbereiten/);
  assert.match(html, /überträgt keine Konfiguration automatisch/);
  assert.doesNotMatch(html, /issues\/new\?[^"]*(?:body|site_json)=/i);
});

test('public issue form requires privacy confirmation before collecting site.json', async () => {
  const form = await read('../.github/ISSUE_TEMPLATE/web-kit-site-request.yml');
  assert.match(form, /Dieses Repository und seine Issues sind öffentlich/);
  assert.match(form, /render: json/);
  assert.match(form, /id: site_json[\s\S]*?required: true/);
  assert.match(form, /private Angaben entfernt[\s\S]*?required: true/);
});

test('Pages workflow builds on PRs but deploys only for main push or dispatch with narrow permissions', async () => {
  const workflow = await read('../.github/workflows/publish-generator-pages.yml');
  assert.match(workflow, /pull_request:[\s\S]*?branches: \[main\]/);
  assert.match(workflow, /push:[\s\S]*?branches: \[main\]/);
  assert.match(workflow, /cp -R generator\/\. _site\//);
  assert.match(workflow, /test -s _site\/admin\/index\.html/);
  assert.match(workflow, /if: \$\{\{ \(github\.event_name == 'push' \|\| github\.event_name == 'workflow_dispatch'\) && github\.ref == 'refs\/heads\/main' \}\}/);
  assert.match(workflow, /permissions:\n      pages: write\n      id-token: write/);
  assert.doesNotMatch(workflow, /secrets\./);
  const actions = [...workflow.matchAll(/^\s+(?:-\s*)?uses: ([^ #]+)/gm)].map((match) => match[1]);
  assert.equal(actions.length, 4);
  for (const action of actions) assert.match(action, /@[0-9a-f]{40}/);
});

test('manual deploy check gate fails closed for missing, failed, pending or wrong-app checks', async () => {
  const workflow = await read('../.github/workflows/publish-generator-pages.yml');
  const filter = workflow.match(/jq -e '([\s\S]*?)' checks\.json/)?.[1];
  assert.ok(filter, 'manual deploy check gate missing');
  const names = ['repository', 'static-check', 'edge-function', 'database'];
  const check = (name, id, conclusion = 'success', status = 'completed', app = 15368) =>
    ({ name, id, conclusion, status, app: { id: app } });
  const good = names.map((name, i) => check(name, i + 1));
  const accepts = (runs) => {
    const result = spawnSync('jq', ['-e', filter], { input: JSON.stringify([{ check_runs: runs }]), encoding: 'utf8' });
    assert.ok([0, 1].includes(result.status), result.stderr);
    return result.status === 0;
  };
  assert.equal(accepts(good), true);
  assert.equal(accepts(good.slice(1)), false);
  assert.equal(accepts([...good, check('database', 100, 'failure')]), false);
  assert.equal(accepts([...good, check('repository', 101, null, 'queued')]), false);
  assert.equal(accepts(good.map((run) => ({ ...run, app: { id: 1 } }))), false);
  assert.equal(accepts([...good, check('database', 101, 'success')]), true);
});
