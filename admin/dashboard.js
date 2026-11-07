import { PROJECTS, loadDeploymentInfo, loadProjectData, workflowState, deploymentState, currentWorkflowState, mainWorkflowAttention, loadPullRequestAttention } from './dashboard-data.js';

const grid = document.querySelector('#project-grid');
const updated = document.querySelector('#dashboard-updated');
const attention = document.querySelector('#attention');
const attentionList = document.querySelector('#attention-list');
const refreshButton = document.querySelector('#refresh-dashboard');
const projectFilter = document.querySelector('#project-filter');
const emptyFilter = document.createElement('p');
emptyFilter.setAttribute('role', 'status');
emptyFilter.hidden = true;
grid.before(emptyFilter);
const cache = new Map();
const CACHE_MS = 15 * 60 * 1000;
let busy = false;

function link(label, href, className = '') {
  const anchor = document.createElement('a');
  anchor.textContent = label;
  anchor.href = href;
  anchor.rel = 'noopener noreferrer';
  anchor.target = '_blank';
  if (className) anchor.className = className;
  return anchor;
}

function statusLabel(state) {
  return ({ success: 'Grün geprüft', failure: 'Fehlgeschlagen', running: 'Läuft', unknown: 'Unbekannt' })[state] || 'Unbekannt';
}

const shortSha = sha => /^[0-9a-f]{40}$/i.test(sha ?? '') ? sha.slice(0, 7) : 'Unbekannt';

function cardFor(data, deployment) {
  const { project, issues, workflow, error } = data;
  const card = document.createElement('article');
  card.className = 'project-card';
  const title = document.createElement('h2');
  title.textContent = project.name;
  card.append(title);

  const state = currentWorkflowState(workflow, data.mainSha);
  const deployedSha = project.repo === 'web-kit'
    ? deployment?.commit
    : workflowState(data.pages) === 'success' ? data.pages.head_sha : null;
  const deployed = deploymentState(project.repo === 'web-kit' ? null : data.pages, data.mainSha, deployedSha);
  const workflowProblems = mainWorkflowAttention(data.runs, data.mainSha);
  const needsAttention = !Array.isArray(data.prAttention) || data.prAttention.length > 0 || state !== 'success' || workflowProblems === null || workflowProblems.length > 0 || deployed !== 'current' || !issues || Boolean(error) || Boolean(issues?.issues || issues?.pullRequests);
  card.dataset.failed = String(state === 'failure');
  card.dataset.attention = String(needsAttention);
  const badge = document.createElement('p');
  badge.className = `status status-${state}`;
  badge.textContent = `Letzter Main-Workflow: ${statusLabel(state)}`;
  card.append(badge);

  const release = document.createElement('p');
  release.className = 'data-warning';
  release.textContent = ({
    current: 'Veröffentlicht · entspricht Main',
    stale: 'Main ist weiter · Veröffentlichung prüfen',
    failure: 'Letzte Veröffentlichung fehlgeschlagen',
    unknown: 'Veröffentlichter Stand nicht bestätigt',
  })[deployed];
  card.append(release);

  const details = document.createElement('dl');
  const issueCounts = issues && issues.truncated
    ? { prs: `mind. ${issues.pullRequests}`, issues: `mind. ${issues.issues}` }
    : { prs: issues ? String(issues.pullRequests) : 'Unbekannt', issues: issues ? String(issues.issues) : 'Unbekannt' };
  const rows = [
    ['Offene Pull Requests', issueCounts.prs],
    ['Offene Issues', issueCounts.issues],
    ['Commit im letzten Main-CI-Lauf', workflow?.head_sha && /^[0-9a-f]{40}$/i.test(workflow.head_sha) ? workflow.head_sha.slice(0, 7) : 'Unbekannt'],
    ['Aktueller Main-Commit', shortSha(data.mainSha)],
    ['Veröffentlichter Commit', shortSha(deployedSha)],
    ['Workflow-Zeit', workflow?.updated_at ? new Date(workflow.updated_at).toLocaleString('de-CH') : 'Unbekannt'],
  ];
  if (project.repo === 'web-kit') {
    rows.push(['Render-Veröffentlichung', deployment?.commit ? `${deployment.branch || 'Branch unbekannt'} · ${deployment.commit.slice(0, 7)}` : 'Unbekannt']);
    rows.push(['Render-Buildzeit', deployment?.builtAt ? new Date(deployment.builtAt).toLocaleString('de-CH') : 'Unbekannt']);
  }
  for (const [labelText, valueText] of rows) {
    const term = document.createElement('dt'); term.textContent = labelText;
    const value = document.createElement('dd'); value.textContent = valueText;
    details.append(term, value);
  }
  card.append(details);
  if (error) {
    const warning = document.createElement('p');
    warning.className = 'data-warning';
    warning.textContent = `Daten teilweise nicht verfügbar: ${error}`;
    card.append(warning);
  }
  if (project.repo === 'web-kit' && deployment?.error) {
    const warning = document.createElement('p'); warning.className = 'data-warning';
    warning.textContent = 'Render-Veröffentlichungsdaten nicht verfügbar.'; card.append(warning);
  }
  const links = document.createElement('div');
  links.className = 'project-links';
  links.append(link('Website', project.url), link('Repository', `https://github.com/mikefaehCH/${encodeURIComponent(project.repo)}`), link('Actions', `https://github.com/mikefaehCH/${encodeURIComponent(project.repo)}/actions`), link('Issues & PRs', `https://github.com/mikefaehCH/${encodeURIComponent(project.repo)}/issues`));
  if (workflow?.head_sha && /^[0-9a-f]{40}$/i.test(workflow.head_sha)) links.append(link('Commit', `https://github.com/mikefaehCH/${encodeURIComponent(project.repo)}/commit/${workflow.head_sha}`));
  if (workflow?.id && /^\d+$/.test(String(workflow.id))) links.append(link('Letzten CI-Lauf', `https://github.com/mikefaehCH/${encodeURIComponent(project.repo)}/actions/runs/${workflow.id}`));
  if (project.hosting) links.append(link('Render-Veröffentlichung prüfen', project.hosting));
  if (project.repo !== 'web-kit' && data.pages?.id && /^\d+$/.test(String(data.pages.id))) {
    links.append(link('Pages-Veröffentlichung prüfen', `https://github.com/mikefaehCH/${encodeURIComponent(project.repo)}/actions/runs/${data.pages.id}`));
  }
  card.append(links);
  return card;
}

function updateAttention(items) {
  attentionList.replaceChildren();
  for (const item of items) {
    const li = document.createElement('li');
    li.textContent = item;
    attentionList.append(li);
  }
  attention.hidden = items.length === 0;
}

function applyFilter() {
  for (const card of grid.children) {
    card.hidden = projectFilter.value === 'attention' && card.dataset.attention !== 'true'
      || projectFilter.value === 'failed' && card.dataset.failed !== 'true';
  }
  const hasResults = [...grid.children].some(card => !card.hidden);
  emptyFilter.hidden = hasResults || !grid.children.length;
  emptyFilter.textContent = projectFilter.value === 'failed'
    ? 'Keine Projekte mit fehlgeschlagenem letztem Main-Workflow gefunden. Unbekannte Zustände sind unter «Alle Projekte» sichtbar.'
    : 'Keine Projekte für diese Ansicht gefunden.';
}

async function refresh() {
  if (busy) return;
  busy = true;
  refreshButton.disabled = true;
  updated.textContent = 'GitHub-Daten werden geladen …';
  try {
    const now = Date.now();
    const [results, deployment] = await Promise.all([Promise.all(PROJECTS.map(async project => {
      const saved = cache.get(project.repo);
      if (saved && now - saved.cachedAt < CACHE_MS) return saved.data;
      const data = await loadProjectData(project).catch(error => ({ project, loadedAt: new Date().toISOString(), issues: null, workflow: null, error: error.message || 'Abruf fehlgeschlagen' }));
      data.prAttention = await loadPullRequestAttention(project);
      cache.set(project.repo, { data, cachedAt: now });
      return data;
    })), loadDeploymentInfo()]);
    grid.replaceChildren(...results.map(item => cardFor(item, deployment)));
    applyFilter();
    const problems = [];
    for (const item of results) {
      const state = currentWorkflowState(item.workflow, item.mainSha);
      if (state === 'failure') problems.push(`${item.project.name}: letzter Main-Workflow fehlgeschlagen`);
      if (state === 'running') problems.push(`${item.project.name}: Main-Workflow läuft`);
      if (state === 'unknown') problems.push(`${item.project.name}: Status des letzten Main-Workflows unbekannt`);
      if (item.issues && (item.issues.issues || item.issues.pullRequests)) problems.push(`${item.project.name}: ${item.issues.pullRequests} offene PR(s), ${item.issues.issues} offene Issues`);
      if (!Array.isArray(item.prAttention)) problems.push(`${item.project.name}: PR-Prüfungen unbekannt`);
      else for (const pr of item.prAttention) problems.push(`${item.project.name}: ${pr.number ? 'PR #' + pr.number : 'PR-Liste'}${pr.name ? ' · ' + pr.name : ''} – ${statusLabel(pr.state)}`);
      const workflowProblems = mainWorkflowAttention(item.runs, item.mainSha);
      if (workflowProblems === null) problems.push(`${item.project.name}: einzelne CI-Läufe unbekannt`);
      else for (const run of workflowProblems) problems.push(`${item.project.name}: ${run.name} – ${statusLabel(run.state)}`);
      const deployed = item.project.repo === 'web-kit'
        ? deploymentState(null, item.mainSha, deployment?.commit)
        : deploymentState(item.pages, item.mainSha, item.pages?.head_sha);
      if (deployed === 'failure') problems.push(`${item.project.name}: letztes Pages-Deployment fehlgeschlagen`);
      if (deployed === 'stale') problems.push(`${item.project.name}: Deployment entspricht nicht dem aktuellen Main-Commit`);
      if (deployed === 'unknown') problems.push(`${item.project.name}: Deployment-Stand unbekannt`);
      if (item.error) problems.push(`${item.project.name}: GitHub-Daten teilweise nicht verfügbar`);
    }
    updateAttention(problems);
    const fetchedAt = results.map(item => Date.parse(item.loadedAt)).filter(Number.isFinite);
    const stamp = fetchedAt.length ? new Date(Math.min(...fetchedAt)).toLocaleString('de-CH') : 'unbekannt';
    updated.textContent = `Datenstand (ältester Teilabruf): ${stamp}. Zwischenspeicherung bis zu 15 Minuten.`;
  } catch {
    updated.textContent = 'GitHub-Daten konnten nicht geladen werden. Bitte später erneut versuchen.';
  } finally {
    busy = false;
    refreshButton.disabled = false;
  }
}

refreshButton.addEventListener('click', refresh);
projectFilter.addEventListener('change', applyFilter);
window.addEventListener('web-kit-admin-authenticated', refresh);
if (!document.querySelector('#workspace').hidden) refresh();
