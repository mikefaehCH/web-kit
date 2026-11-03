import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync as execute } from 'node:child_process';
// Nested node --test must run normally, not inherit the parent runner context.
const childEnvironment = { ...process.env };
delete childEnvironment.NODE_TEST_CONTEXT;
const execFileSync = (command, args, options = {}) =>
  execute(command, args, { ...options, env: childEnvironment });
import {
  generateProject,
  TEMPLATE_FILES,
  loadBrowserTemplates,
} from '../modules/site-generator.js';
import { createZip } from '../modules/zip.js';
import { makeSite } from '../admin/site-schema.js';
const source = fileURLToPath(new URL('../', import.meta.url));
const site = makeSite({
  start: '2027-06-01',
  end: '2027-06-03',
  title: '</title><script>alert(1)</script>',
});
const load = async () =>
  new Map(
    await Promise.all(
      TEMPLATE_FILES.map(async (path) => [
        path,
        new Uint8Array(await readFile(resolve(source, path))),
      ]),
    ),
  );
test('travel template is byte-identical to the demo source', async () => {
  assert.deepEqual(await readFile(resolve(source, 'templates/dated-places/index.html')), await readFile(resolve(source, 'index.html')));
});
test('manifest short_name truncates Unicode codepoints without splitting emoji or umlauts', async () => {
  const templates = await load();
  for (const ending of ['😀', 'ä']) {
    const title = 'x'.repeat(23) + ending + 'weiter';
    const output = generateProject({ ...site, title }, templates);
    const manifest = JSON.parse(new TextDecoder().decode(output.get('manifest.webmanifest')));
    assert.equal(manifest.short_name, 'x'.repeat(23) + ending);
    assert.equal(Array.from(manifest.short_name).length, 24);
    assert.equal(manifest.short_name.isWellFormed(), true);
  }
});
test('ZIP is repeatable, extracts with CRC checks, installs, tests and regenerates', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'web-kit-zip-'));
  try {
    const templates = await load();
    const output = generateProject(site, templates);
    const zip = createZip(output);
    assert.deepEqual(zip, createZip(generateProject(site, templates)));
    assert.deepEqual(zip, createZip(new Map([...output].reverse())));
    const html = new TextDecoder().decode(output.get('index.html'));
    assert.ok(html.includes('&lt;script&gt;'));
    assert.ok(!html.includes('<script>alert(1)</script>'));
    assert.throws(() => generateProject(site, new Map()));
    await writeFile(join(dir, 'input.json'), JSON.stringify(site));
    execFileSync(process.execPath, [
      join(source, 'scripts/create.mjs'),
      join(dir, 'input.json'),
      join(dir, 'cli'),
    ]);
    for (const [path, bytes] of output)
      assert.deepEqual(new Uint8Array(await readFile(join(dir, 'cli', path))), bytes);
    await writeFile(join(dir, 'website.zip'), zip);
    execFileSync('python3', [
      '-c',
      'import zipfile,sys\nz=zipfile.ZipFile(sys.argv[1]); assert z.testzip() is None; z.extractall(sys.argv[2])',
      join(dir, 'website.zip'),
      join(dir, 'website'),
    ]);
    execFileSync('npm', ['ci', '--ignore-scripts'], { cwd: join(dir, 'website'), stdio: 'pipe' });
    execFileSync('npm', ['test'], { cwd: join(dir, 'website'), stdio: 'pipe' });
    execFileSync(process.execPath, [
      join(dir, 'website/scripts/create.mjs'),
      join(dir, 'website/site.json'),
      join(dir, 'again'),
    ]);
    assert.equal(
      await readFile(join(dir, 'again/site.json'), 'utf8'),
      await readFile(join(dir, 'website/site.json'), 'utf8'),
    );
    await writeFile(
      join(dir, 'website/tests/must-fail.mjs'),
      "throw Error('negative-test-sentinel');\n",
    );
    assert.throws(() =>
      execFileSync('npm', ['test'], { cwd: join(dir, 'website'), stdio: 'pipe' }),
    );
    // Every generated import/asset needed by subsequent generation is retained.
    for (const path of TEMPLATE_FILES) await readFile(join(dir, 'again', path));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test('ZIP rejects path traversal, absolute paths, separators, reserved segments and excess size', () => {
  for (const path of [
    '../secret',
    '/tmp/a',
    'C:/tmp/a',
    'a\\b',
    'a//b',
    'a/../b',
    './x',
    'a\u0000b',
    'a\nb',
  ])
    assert.throws(() => createZip(new Map([[path, new Uint8Array()]])), path);
  assert.throws(() => createZip(new Map([['a', new Uint8Array(10000001)]])));
});
test('browser loader rejects failed files and uses only the fixed template paths', async () => {
  let seen = [];
  const fake = async (url, options) => {
    seen.push(url.pathname);
    assert.equal(options.credentials, 'omit');
    return { ok: true, arrayBuffer: async () => new ArrayBuffer(0) };
  };
  await loadBrowserTemplates(new URL('https://example.test/starter/'), fake);
  assert.deepEqual(seen.sort(), TEMPLATE_FILES.map((path) => '/starter/' + path).sort());
  await assert.rejects(
    loadBrowserTemplates(new URL('https://example.test/'), async () => ({ ok: false })),
  );
});

test('general ZIP and category switches regenerate from canonical data without leaking travel dates', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'web-kit-categories-'));
  try {
    const general = makeSite({
      category: 'general',
      title: 'Infoseite',
      content: { sections: [{ heading: 'Inhalt', text: 'Nur Text <img src=x>' }] },
    });
    const output = generateProject(general, await load());
    const html = new TextDecoder().decode(output.get('index.html'));
    assert.ok(!html.includes('id="dates"'));
    await writeFile(join(dir, 'general.zip'), createZip(output));
    execFileSync('python3', [
      '-c',
      'import zipfile,sys\nz=zipfile.ZipFile(sys.argv[1]); assert z.testzip() is None; z.extractall(sys.argv[2])',
      join(dir, 'general.zip'),
      join(dir, 'general'),
    ]);
    execFileSync('npm', ['ci', '--ignore-scripts'], { cwd: join(dir, 'general'), stdio: 'pipe' });
    execFileSync('npm', ['test'], { cwd: join(dir, 'general'), stdio: 'pipe' });
    const categoryFile = join(dir, 'general/categories/travel/category.json');
    const category = JSON.parse(await readFile(categoryFile, 'utf8'));
    category.presets.push({ id: 'family-trip', label: 'Familienreise' });
    await writeFile(categoryFile, JSON.stringify(category));
    const next = makeSite({
      category: 'travel',
      start: '2027-06-01',
      end: '2027-06-03',
      content: {
        start: '2027-06-01',
        end: '2027-06-03',
        places: [
          {
            id: 'test',
            name: 'Test',
            category: 'Test',
            description: 'Synthetischer Test',
            coordinates: [0, 0],
          },
        ],
      },
    });
    await writeFile(join(dir, 'next.json'), JSON.stringify({ ...next, preset: 'family-trip' }));
    execFileSync(process.execPath, [
      join(dir, 'general/scripts/create.mjs'),
      join(dir, 'next.json'),
      join(dir, 'travel'),
    ]);
    assert.ok((await readFile(join(dir, 'travel/index.html'), 'utf8')).includes('id="dates"'));
    execFileSync('npm', ['test'], { cwd: join(dir, 'travel'), stdio: 'pipe' });
    await writeFile(join(dir, 'next.json'), JSON.stringify(general));
    execFileSync(process.execPath, [
      join(dir, 'travel/scripts/create.mjs'),
      join(dir, 'next.json'),
      join(dir, 'general-again'),
    ]);
    assert.equal(
      await readFile(join(dir, 'general-again/site.json'), 'utf8'),
      await readFile(join(dir, 'general/site.json'), 'utf8'),
    );
    execFileSync('npm', ['test'], { cwd: join(dir, 'general-again'), stdio: 'pipe' });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
