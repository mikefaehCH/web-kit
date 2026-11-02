import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeTree, summarizePulls, parseLinkLastPage, fetchInventory, renderMarkdown } from '../scripts/inventory-core.mjs';

const tree = {
  truncated: false,
  tree: [
    { type: 'blob', path: 'src/app.js', size: 81 },
    { type: 'blob', path: 'tests/check.test.mjs', size: 12 },
    { type: 'blob', path: '.github/workflows/test.yml', size: 17 },
    { type: 'blob', path: 'images/hero.webp', size: 1000 },
    { type: 'blob', path: 'node_modules/cache/file.js', size: 3000 },
    { type: 'tree', path: 'src' },
  ],
};

test('source, assets, tests and workflows are categorized without double-counting', () => {
  const x = summarizeTree(tree);
  assert.equal(x.trackedFiles, 4);
  assert.equal(x.sourceFiles, 3);
  assert.equal(x.assetFiles, 1);
  assert.equal(x.sourceBytes, 110);
  assert.equal(x.assetBytes, 1000);
  assert.equal(x.testFiles, 1);
  assert.equal(x.workflowFiles, 1);
  assert.equal(x.linesOfCode, null);
});

test('truncated tree and missing byte sizes fail closed', () => {
  assert.throws(() => summarizeTree({ ...tree, truncated: true }), /Unvollständiger/);
  assert.throws(() => summarizeTree({ truncated: false, tree: [{ type: 'blob', path: 'index.js' }] }), /Dateigrösse/);
});

test('pull requests are counted by actual merge state', () => {
  assert.deepEqual(summarizePulls([
    { state: 'open', merged_at: null },
    { state: 'closed', merged_at: '2026-11-01T01:00:00Z' },
    { state: 'closed', merged_at: null },
  ]), { total: 3, open: 1, merged: 1, closedUnmerged: 1 });
});

test('last page links are parsed safely', () => {
  assert.equal(parseLinkLastPage('<https://api.github.com/repos/a/b/pulls?page=23>; rel="last"'), 23);
  assert.equal(parseLinkLastPage(''), null);
});

test('inventory fetch uses default branch, paginates and reports reproducibly', async () => {
  const calls = [];
  const fetchJson = async (path) => {
    calls.push(path);
    if (path === '/repos/mikefaehCH/camino') return { full_name: 'mikefaehCH/camino', default_branch: 'main', size: 42 };
    if (path.includes('/git/trees/')) return tree;
    if (path.includes('/languages')) return { JavaScript: 123 };
    if (path.includes('/pulls')) return [{ state: 'open', merged_at: null }];
    throw Error(`Unerwartet: ${path}`);
  };
  const report = await fetchInventory({ owner: 'mikefaehCH', repositories: ['camino'], fetchJson, generatedAt: '2026-11-02T00:00:00Z' });
  assert.equal(report.repositories[0].tree.trackedFiles, 4);
  assert.equal(report.repositories[0].pullRequests.open, 1);
  assert.match(calls.join('\n'), /git\/trees\/main\?recursive=1/);
  const markdown = renderMarkdown(report);
  assert.match(markdown, /camino/);
  assert.match(markdown, /nicht.*geschätzt/i);
});

test('malformed or mismatched repo metadata fails closed', async () => {
  await assert.rejects(fetchInventory({ owner: 'mikefaehCH', repositories: ['camino'], fetchJson: async () => ({ full_name: 'other/camino', default_branch: 'main' }), generatedAt: '' }), /Unpassendes Repository/);
  await assert.rejects(fetchInventory({ owner: 'mikefaehCH', repositories: ['../token'], fetchJson: async () => {}, generatedAt: '' }), /Ungültiger Repository-Name/);
});
