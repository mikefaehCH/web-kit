import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync as execute } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const source = fileURLToPath(new URL('../', import.meta.url));
const generator = join(source, 'scripts/create.mjs');
const example = join(source, 'examples/demo-site.json');
const childEnvironment = { ...process.env };
delete childEnvironment.NODE_TEST_CONTEXT;
const run = (command, args, options = {}) =>
  execute(command, args, { ...options, env: childEnvironment, stdio: 'pipe' });

async function files(root, directory = root) {
  const result = new Map();
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      for (const [name, bytes] of await files(root, path)) result.set(name, bytes);
    } else {
      result.set(relative(root, path), await readFile(path));
    }
  }
  return result;
}

test('fiktive Demo wird per CLI deterministisch erzeugt und besteht ihre Tests', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'web-kit-demo-'));
  try {
    const first = join(directory, 'first');
    const second = join(directory, 'second');
    run(process.execPath, [generator, example, first]);
    run(process.execPath, [generator, example, second]);
    run('npm', ['ci', '--ignore-scripts'], { cwd: first });
    run('npm', ['test'], { cwd: first });

    const firstFiles = await files(first);
    const secondFiles = await files(second);
    assert.deepEqual([...firstFiles.keys()], [...secondFiles.keys()]);
    for (const [name, bytes] of firstFiles)
      assert.deepEqual(bytes, secondFiles.get(name), name + ' ist nicht deterministisch');

    assert.match(firstFiles.get('index.html').toString(), /<title>Web-kit Demo<\/title>/);
    assert.equal(JSON.parse(firstFiles.get('site.json')).id, 'web-kit-demo');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('Kurzbriefing erstellt eine prüfbare lokale Vorschau und schützt bestehende Ziele', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'web-kit-brief-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const brief = join(source, 'examples/demo-brief.json');
  const first = join(directory, 'first');
  const second = join(directory, 'second');
  run(process.execPath, [generator, '--brief', brief, first]);
  run(process.execPath, [generator, '--brief', brief, second]);
  run('npm', ['ci', '--ignore-scripts'], { cwd: first });
  run('npm', ['test'], { cwd: first });

  const generated = await files(first);
  assert.deepEqual(await files(second), generated);
  const site = JSON.parse(generated.get('site.json'));
  assert.equal(site.id, 'quartierflohmarkt-im-uberblick');
  assert.equal(site.preset, 'info-page');
  assert.deepEqual(Object.keys(site.modules).filter(name => site.modules[name]), ['offline']);
  assert.deepEqual(site.content.sections.map(section => section.heading), ['Überblick', 'Für wen']);
  assert.match(generated.get('index.html').toString(), /id="section-navigation"/);

  assert.throws(() => run(process.execPath, [generator, '--brief', brief, first]), error => {
    assert.equal(error.status, 1);
    assert.match(error.stderr.toString(), /Ziel existiert bereits; es wird nichts überschrieben/);
    return true;
  });
  assert.deepEqual(await files(first), generated);

  const invalid = join(directory, 'invalid.json');
  await writeFile(invalid, JSON.stringify({ purpose: 'Quartierflohmarkt' }));
  const missing = join(directory, 'missing');
  assert.throws(() => run(process.execPath, [generator, '--brief', invalid, missing]), error => {
    assert.equal(error.status, 1);
    assert.match(error.stderr.toString(), /Ungültig: Zielgruppe/);
    return true;
  });
  assert.ok(!(await readdir(directory)).includes('missing'));
});
