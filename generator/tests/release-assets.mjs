import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { checkReleaseAssets } from '../../scripts/check-release-assets.mjs';

test('flags an older script behind the versioned URL of the current entry', async t => {
  const root = await mkdtemp(join(tmpdir(), 'release-assets-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const html = '<link rel="stylesheet" href="site.css?v=2"><script src="app.js?v=2"></script><script src="https://cdn.example/lib.js"></script>';
  const files = { 'index.html': html, 'app.js': 'v2', 'site.css': 'style-v2', 'sw.js': 'cache-v2' };
  await Promise.all(Object.entries(files).map(([name, value]) => writeFile(join(root, name), value)));
  const seen = [];
  const report = await checkReleaseAssets('https://example.test/site/', root, ['sw.js'], async url => {
    seen.push(url.pathname + url.search);
    const file = url.pathname.split('/').at(-1) || 'index.html';
    return new Response(file === 'app.js' ? 'v1' : files[file]);
  });
  assert.deepEqual(seen.sort(), ['/site/', '/site/app.js?v=2', '/site/site.css?v=2', '/site/sw.js']);
  assert.deepEqual(report.filter(x => x.failure), [
    { href: 'https://example.test/site/app.js?v=2', failure: 'Inhalt weicht vom Release ab' },
  ]);
});
