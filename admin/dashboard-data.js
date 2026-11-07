export const PROJECTS = Object.freeze([
  { name: 'Web-Kit', repo: 'web-kit', url: 'https://mikefaehch.github.io/web-kit/', hosting: 'https://dashboard.render.com/static/srv-dbkagf1srm7s739t6230' },
  { name: 'Sommer2027', repo: 'Sommer2027', url: 'https://mikefaehch.github.io/Sommer2027/' },
  { name: 'Camino', repo: 'camino', url: 'https://mikefaehch.github.io/camino/' },
  { name: 'Zuerich', repo: 'zuerich', url: 'https://mikefaehch.github.io/zuerich/' },
  { name: 'Valencia', repo: 'Valencia', url: 'https://mikefaehch.github.io/Valencia/' },
  { name: 'Edinburgh', repo: 'edinburgh', url: 'https://mikefaehch.github.io/edinburgh/' },
]);

const API = 'https://api.github.com';
const OWNER = 'mikefaehCH';
const REQUEST_TIMEOUT_MS = 8_000;

async function githubJson(path, fetchImpl) {
  const url = new URL(path, API);
  if (url.origin !== API) throw new Error('Untrusted GitHub API URL');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetchImpl(url, {
      headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
      credentials: 'omit',
      redirect: 'error',
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`GitHub HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

function splitOpenItems(items) {
  if (!Array.isArray(items)) throw new Error('Unexpected issues response');
  return {
    issues: items.filter(item => !item.pull_request).length,
    pullRequests: items.filter(item => Boolean(item.pull_request)).length,
    truncated: items.length === 100,
  };
}

function latestMainPush(runs) {
  if (!Array.isArray(runs)) throw new Error('Unexpected workflow response');
  return runs.find(run => run.event === 'push' && run.head_branch === 'main') ?? null;
}

export function workflowState(run) {
  if (!run) return 'unknown';
  if (['queued', 'in_progress', 'requested', 'waiting', 'pending'].includes(run.status)) return 'running';
  if (run.status !== 'completed') return 'unknown';
  if (run.conclusion === 'success') return 'success';
  if (run.conclusion === 'failure' || run.conclusion === 'timed_out' || run.conclusion === 'cancelled') return 'failure';
  return 'unknown';
}

export async function loadProjectData(project, fetchImpl = fetch) {
  if (!PROJECTS.some(knownProject => knownProject.repo === project?.repo)) throw new Error('Unknown project');
  const base = `/repos/${OWNER}/${encodeURIComponent(project.repo)}`;
  const [itemsResult, runsResult, mainResult] = await Promise.allSettled([
    githubJson(`${base}/issues?state=open&per_page=100`, fetchImpl),
    githubJson(`${base}/actions/runs?branch=main&per_page=100`, fetchImpl),
    githubJson(`${base}/commits/main`, fetchImpl),
  ]);
  const result = { project, loadedAt: new Date().toISOString(), issues: null, workflow: null, mainSha: null, pages: null, runs: null, error: null };
  const errors = [];
  if (itemsResult.status === 'fulfilled') {
    try { result.issues = splitOpenItems(itemsResult.value); }
    catch (error) { errors.push(error); }
  } else errors.push(itemsResult.reason);
  if (runsResult.status === 'fulfilled') {
    try {
      const runs = runsResult.value.workflow_runs;
      result.workflow = latestMainPush(runs);
      result.runs = runs;
      result.pages = runs.find(run => run.name === 'pages build and deployment' && run.head_branch === 'main') ?? null;
    }
    catch (error) { errors.push(error); }
  } else errors.push(runsResult.reason);
  if (mainResult.status === 'fulfilled' && /^[0-9a-f]{40}$/i.test(mainResult.value?.sha || '')) result.mainSha = mainResult.value.sha;
  else errors.push(mainResult.status === 'rejected' ? mainResult.reason : new Error('Main-Commit unbekannt'));
  if (errors.length) result.error = errors.map(error => error?.message || 'Abruf fehlgeschlagen').join('; ');
  return result;
}

export async function loadDeploymentInfo(fetchImpl = fetch) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetchImpl(new URL('./deployment.json', import.meta.url), {
      headers: { Accept: 'application/json' }, credentials: 'omit', redirect: 'error', signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Deployment-Info HTTP ${response.status}`);
    const info = await response.json();
    const validCommit = typeof info?.commit === 'string' && /^[0-9a-f]{40}$/i.test(info.commit);
    const validBranch = info?.branch === null || typeof info?.branch === 'string' && /^[A-Za-z0-9._/-]{1,100}$/.test(info.branch);
    const validBuiltAt = typeof info?.builtAt === 'string' && Number.isFinite(Date.parse(info.builtAt));
    if (!validCommit || !validBranch || !validBuiltAt) return { commit: null, branch: null, builtAt: null, error: null };
    return { commit: info.commit, branch: validBranch ? info.branch : null, builtAt: info.builtAt, error: null };
  } catch (error) {
    return { commit: null, branch: null, builtAt: null, error: error?.message || 'Deployment-Info nicht verfügbar' };
  } finally {
    clearTimeout(timer);
  }
}

// A successful build is current only when both full SHAs are known and equal.
export function deploymentState(run, mainSha, publishedSha) {
  if (run && workflowState(run) === 'failure') return 'failure';
  if (run && workflowState(run) !== 'success') return 'unknown';
  const valid = sha => typeof sha === 'string' && /^[0-9a-f]{40}$/i.test(sha);
  if (!valid(mainSha) || !valid(publishedSha)) return 'unknown';
  return mainSha.toLowerCase() === publishedSha.toLowerCase() ? 'current' : 'stale';
}

export function currentWorkflowState(run, mainSha) {
  const state = workflowState(run);
  if (state !== 'success') return state;
  return deploymentState(null, mainSha, run?.head_sha) === 'current' ? 'success' : 'unknown';
}

// Only report the latest attempt of each workflow for the exact main commit.
export function mainWorkflowAttention(runs, mainSha) {
  if (!Array.isArray(runs) || !/^[0-9a-f]{40}$/i.test(mainSha || '')) return null;
  const latest = new Map();
  for (const run of runs) {
    if (run.head_branch !== 'main' || run.head_sha !== mainSha || !run.name) continue;
    if (!latest.has(run.name)) latest.set(run.name, run);
  }
  if (!latest.size) return null;
  return [...latest.values()].map(run => ({ name: run.name, state: workflowState(run) })).filter(run => run.state !== 'success');
}

// Match PR workflows to the exact current head; absent or truncated data is unknown.
export function pullRequestAttention(pulls, runs) {
  if (!Array.isArray(pulls) || !Array.isArray(runs)) return null;
  const problems = [];
  if (pulls.length >= 100 || (pulls.length && runs.length >= 100)) problems.push({number:null, state:'unknown'});
  for (const pr of pulls) {
    if (!Number.isSafeInteger(pr?.number) || !/^[0-9a-f]{40}$/i.test(pr?.head?.sha || '')) { problems.push({number:null,state:'unknown'}); continue; }
    const matching = runs.filter(run => run.event === 'pull_request' && run.head_sha === pr.head.sha && typeof run.name === 'string');
    const latest = new Map();
    for (const run of matching) if (!latest.has(run.name)) latest.set(run.name, run);
    if (!latest.size) problems.push({number:pr.number,state:'unknown'});
    for (const run of latest.values()) { const state=workflowState(run); if(state!=='success') problems.push({number:pr.number,name:run.name,state}); }
  }
  return problems;
}
export async function loadPullRequestAttention(project, fetchImpl=fetch) {
  if (!PROJECTS.some(p => p.repo === project?.repo)) throw new Error('Unknown project');
  const base=`/repos/${OWNER}/${encodeURIComponent(project.repo)}`;
  try {
    const [pulls, data] = await Promise.all([githubJson(`${base}/pulls?state=open&per_page=100`,fetchImpl),githubJson(`${base}/actions/runs?event=pull_request&per_page=100`,fetchImpl)]);
    return pullRequestAttention(pulls,data?.workflow_runs);
  } catch { return null; }
}
