// No credentials, private file contents or user records are included in reports.
const SOURCE = /\.(?:[cm]?[jt]sx?|html?|css|scss|json|jsonc|ya?ml|py|sh|sql|svg|xml)$/i;
const ASSET = /\.(?:png|jpe?g|webp|gif|ico|avif|woff2?|ttf|otf|pdf|gpx|mp4|webm|mov|mp3|wav|zip)$/i;
const IGNORED = /(^|\/)(?:node_modules|dist|build|\.cache|coverage)\//;

export function summarizeTree(tree) {
  if (!tree || tree.truncated !== false || !Array.isArray(tree.tree)) {
    throw new Error('Unvollständiger Git-Tree: Metriken werden nicht geschätzt');
  }
  const files = tree.tree.filter((item) => item.type === 'blob' && !IGNORED.test(item.path));
  const summary = {
    trackedFiles: files.length,
    sourceFiles: 0,
    sourceBytes: 0,
    assetFiles: 0,
    assetBytes: 0,
    otherFiles: 0,
    otherBytes: 0,
    testFiles: 0,
    workflowFiles: 0,
    // LOC is intentionally not estimated from bytes or GitHub repository size.
    linesOfCode: null,
  };
  for (const file of files) {
    const bytes = file.size;
    if (!Number.isSafeInteger(bytes) || bytes < 0) throw new Error('Ungültige Dateigrösse');
    if (/(^|\/)(tests?|__tests__)\//.test(file.path)) summary.testFiles++;
    if (/^\.github\/workflows\/[^/]+\.ya?ml$/.test(file.path)) summary.workflowFiles++;
    const category = ASSET.test(file.path) ? 'asset' : SOURCE.test(file.path) ? 'source' : 'other';
    summary[category + 'Files']++;
    summary[category + 'Bytes'] += bytes;
  }
  return summary;
}

export function summarizePulls(pulls) {
  const result = { total: pulls.length, open: 0, merged: 0, closedUnmerged: 0 };
  for (const pr of pulls) {
    if (pr.merged_at) result.merged++;
    else if (pr.state === 'open') result.open++;
    else if (pr.state === 'closed') result.closedUnmerged++;
    else throw new Error('Unbekannter PR-Status');
  }
  return result;
}

export function parseLinkLastPage(linkHeader) {
  const value = linkHeader?.match(/<([^>]+)>;\s*rel="last"/);
  if (!value) return null;
  const page = new URL(value[1]).searchParams.get('page');
  const number = Number(page);
  return Number.isSafeInteger(number) && number > 0 ? number : null;
}

export function renderMarkdown(report) {
  const rows = report.repositories.map((r) => {
    const s = r.tree;
    const p = r.pullRequests;
    return `| [${r.name}](https://github.com/${report.owner}/${r.name}) | ${s.trackedFiles} | ${s.sourceFiles} | ${s.assetFiles} | ${s.testFiles} | ${s.workflowFiles} | ${p.total} | ${p.open} |`;
  });
  return [
    '# Repository-Inventar',
    '',
    `Erstellt: ${report.generatedAt} (GitHub REST API, Standardbranch jedes Repositories).`,
    '',
    '| Repo | Dateien | Quelltextdateien | Assets | Testdateien | Workflows | PRs | Offen |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
    ...rows,
    '',
    'Hinweise: `Quelltextdateien` basiert auf Dateiendungen und enthält auch JSON, YAML und SVG. ',
    'Dateigrössen stammen aus Git-Trees und unterscheiden sich von der GitHub-Repositorygrösse.',
    'Generierte/ignorierte Ordner werden nicht berücksichtigt. Codezeilen werden **nicht** aus Bytezahlen geschätzt.',
    'PR-Zahlen enthalten offene, gemergte und ohne Merge geschlossene PRs.',
    'Sicherheits-, Deployment- oder RLS-Eigenschaften sind durch dieses Inventar **nicht** validiert.',
    '',
  ].join('\n');
}

export async function fetchInventory({ owner, repositories, fetchJson, generatedAt }) {
  if (!/^[a-z\d-]{1,39}$/i.test(owner)) throw new Error('Ungültiger GitHub-Eigentümer');
  if (!Array.isArray(repositories) || !repositories.length || repositories.length > 30) {
    throw new Error('Ungültige Repository-Liste');
  }
  const results = [];
  for (const name of repositories) {
    if (!/^[\w.-]{1,100}$/.test(name)) throw new Error('Ungültiger Repository-Name');
    const root = `/repos/${owner}/${encodeURIComponent(name)}`;
    const repo = await fetchJson(root);
    if (repo.full_name !== `${owner}/${name}` || !repo.default_branch) {
      throw new Error(`Unpassendes Repository: ${name}`);
    }
    const tree = await fetchJson(`${root}/git/trees/${encodeURIComponent(repo.default_branch)}?recursive=1`);
    const languages = await fetchJson(`${root}/languages`);
    const pulls = [];
    for (let page = 1; page <= 50; page++) {
      const batch = await fetchJson(`${root}/pulls?state=all&per_page=100&page=${page}`);
      if (!Array.isArray(batch)) throw new Error('Ungültige PR-Antwort');
      pulls.push(...batch);
      if (batch.length < 100) break;
      if (page === 50) throw new Error('PR-Pagination überschreitet Sicherheitsgrenze');
    }
    results.push({
      name,
      defaultBranch: repo.default_branch,
      sizeKiB: repo.size,
      languages,
      tree: summarizeTree(tree),
      pullRequests: summarizePulls(pulls),
    });
  }
  return { version: 1, owner, generatedAt, repositories: results };
}
