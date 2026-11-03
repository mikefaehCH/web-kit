import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { PROJECTS, loadDeploymentInfo, loadProjectData, workflowState } from '../admin/dashboard-data.js';
import { isAdminUser } from '../admin/auth-policy.js';

function response(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

test('dashboard only contains the six verified public projects', () => {
  assert.deepEqual(PROJECTS.map(project => project.repo), ['web-kit', 'Sommer2027', 'camino', 'zuerich', 'Valencia', 'edinburgh']);
  assert.ok(PROJECTS.every(project => project.url.startsWith('https://')));
});

test('admin authorization is exact and cannot be granted by user metadata', () => {
  assert.equal(isAdminUser({ app_metadata: { web_kit_admin: true } }), true);
  assert.equal(isAdminUser({ app_metadata: { web_kit_admin: 'true' } }), false);
  assert.equal(isAdminUser({ user_metadata: { web_kit_admin: true } }), false);
  assert.equal(isAdminUser(null), false);
});

test('latest eligible main push is classified without treating unknown as success', async () => {
  const fetchImpl = async input => {
    const url = new URL(input);
    if (url.pathname.endsWith('/issues')) return response([{ number: 1 }, { number: 2, pull_request: {} }]);
    return response({ workflow_runs: [
      { event: 'pull_request', head_branch: 'feature', conclusion: 'success' },
      { event: 'push', head_branch: 'main', status: 'completed', conclusion: 'failure', head_sha: 'abc1234', updated_at: '2026-11-03T10:00:00Z' },
      { event: 'push', head_branch: 'main', status: 'completed', conclusion: 'success' },
    ] });
  };
  const data = await loadProjectData(PROJECTS[0], fetchImpl);
  assert.equal(data.issues.issues, 1);
  assert.equal(data.issues.pullRequests, 1);
  assert.equal(data.workflow.head_sha, 'abc1234');
  assert.equal(workflowState(data.workflow), 'failure');
  assert.equal(workflowState(null), 'unknown');
  assert.equal(workflowState({ status: 'in_progress' }), 'running');
  assert.equal(workflowState({ status: 'completed', conclusion: 'neutral' }), 'unknown');
});

test('GitHub calls are anonymous, host-pinned, redirect-safe and time bounded', async () => {
  const calls = [];
  const fetchImpl = async (input, options) => {
    calls.push({ url: new URL(input), options });
    return calls.length % 2 ? response([]) : response({ workflow_runs: [] });
  };
  await loadProjectData(PROJECTS[1], fetchImpl);
  assert.equal(calls.length, 2);
  for (const call of calls) {
    assert.equal(call.url.origin, 'https://api.github.com');
    assert.equal(call.options.credentials, 'omit');
    assert.equal(call.options.redirect, 'error');
    assert.equal('Authorization' in call.options.headers, false);
    assert.ok(call.options.signal instanceof AbortSignal);
  }
});

test('API failures and malformed payloads remain unknown and visible as errors', async () => {
  const data = await loadProjectData(PROJECTS[2], async input => {
    if (new URL(input).pathname.endsWith('/issues')) return response({ html: '<script>no</script>' });
    return response({}, 403);
  });
  assert.equal(data.issues, null);
  assert.equal(data.workflow, null);
  assert.match(data.error, /Unexpected issues response/);
  assert.match(data.error, /GitHub HTTP 403/);
  assert.equal(workflowState(data.workflow), 'unknown');
});

test('timeouts and network failures do not produce green status', async () => {
  const data = await loadProjectData(PROJECTS[3], async () => { throw new Error('timeout'); });
  assert.equal(data.workflow, null);
  assert.equal(data.issues, null);
  assert.equal(workflowState(data.workflow), 'unknown');
  assert.match(data.error, /timeout/);
});

test('Render deployment metadata is accepted only for a real commit SHA and timestamp', async () => {
  const good = await loadDeploymentInfo(async () => response({ commit: 'a'.repeat(40), branch: 'main', builtAt: '2026-11-03T12:00:00.000Z' }));
  assert.equal(good.commit, 'a'.repeat(40));
  assert.equal(good.branch, 'main');
  const bad = await loadDeploymentInfo(async () => response({ commit: '<script>', branch: 'main', builtAt: 'yesterday' }));
  assert.equal(bad.commit, null);
  assert.equal(bad.error, null);
  const failed = await loadDeploymentInfo(async () => response({}, 503));
  assert.equal(failed.commit, null);
  assert.match(failed.error, /503/);
});

test('static shell has password auth, no public signup, safe DOM rendering and GitHub CSP', async () => {
  const [html, auth, dashboard, render] = await Promise.all([
    readFile(new URL('../admin/whatsapp.html', import.meta.url), 'utf8'),
    readFile(new URL('../admin/auth.js', import.meta.url), 'utf8'),
    readFile(new URL('../admin/dashboard.js', import.meta.url), 'utf8'),
    readFile(new URL('../render.yaml', import.meta.url), 'utf8'),
  ]);
  assert.match(html, /type="password" autocomplete="current-password"/);
  assert.match(html, /id="composer"/);
  assert.match(auth, /signInWithPassword/);
  assert.match(auth, /resetPasswordForEmail/);
  assert.match(auth, /isAdminUser\(user\)/);
  assert.match(auth, /persistSession:true/);
  assert.match(auth, /autoRefreshToken:true/);
  assert.doesNotMatch(auth, /signUp\(/);
  assert.doesNotMatch(dashboard, /innerHTML|insertAdjacentHTML/);
  assert.match(dashboard, /textContent/);
  assert.match(render, /connect-src https:\/\/qoensghjemruqafrbmjd\.supabase\.co https:\/\/api\.github\.com/);
});
