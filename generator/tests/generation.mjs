import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync as execute } from 'node:child_process';
// Nested node --test must run normally, not inherit the parent runner context.
const childEnvironment = { ...process.env };
delete childEnvironment.NODE_TEST_CONTEXT;
const execFileSync = (command, args, options = {}) =>
  execute(command, args, { ...options, env: childEnvironment });
import { makeSite as makeBaseSite, validateSite } from '../admin/site-schema.js';
const makeSite = (options = {}) =>
  makeBaseSite({ start: '2027-06-01', end: '2027-06-03', ...options });
const generator = new URL('../scripts/create.mjs', import.meta.url);
test('site.json produces repeatable runnable projects without example data', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'site-generator-'));
  try {
    const config = makeSite({
      id: 'generated-site',
      title: 'Eigene Website',
      start: '2027-06-01',
      end: '2027-06-03',
    });
    const input = join(dir, 'site.json');
    await writeFile(input, JSON.stringify(config));
    for (const name of ['first', 'second']) {
      execFileSync(process.execPath, [generator.pathname, input, join(dir, name)]);
      execFileSync('npm', ['ci', '--ignore-scripts'], { cwd: join(dir, name), stdio: 'pipe' });
      execFileSync('npm', ['test'], { cwd: join(dir, name), stdio: 'pipe' });
      const module = await import(new URL('file://' + join(dir, name, 'config.js')));
      assert.deepEqual(module.trips.city.places, []);
      assert.equal(module.trips.city.start, config.content.start);
      assert.equal(module.trips.city.title, config.title);
    }
    await writeFile(
      join(dir, 'first/site.json'),
      JSON.stringify({
        ...config,
        title: 'Neuer Titel',
        description: 'Neue Beschreibung',
        color: '#123456',
      }),
    );
    execFileSync(process.execPath, [
      join(dir, 'first/scripts/create.mjs'),
      join(dir, 'first/site.json'),
      join(dir, 'regenerated'),
    ]);
    execFileSync('npm', ['test'], { cwd: join(dir, 'regenerated'), stdio: 'pipe' });
    const regeneratedHtml = await readFile(join(dir, 'regenerated/index.html'), 'utf8');
    assert.ok(regeneratedHtml.includes('<title>Neuer Titel</title>'));
    assert.ok(regeneratedHtml.includes('Neue Beschreibung'));
    assert.ok(regeneratedHtml.includes('#123456'));
    for (const file of ['config.js', 'manifest.webmanifest']) {
      assert.equal(
        await readFile(join(dir, 'first', file), 'utf8'),
        await readFile(join(dir, 'second', file), 'utf8'),
      );
    }
    assert.throws(() =>
      execFileSync(process.execPath, [generator.pathname, input, join(dir, 'first')], {
        stdio: 'pipe',
      }),
    );
    await writeFile(input, JSON.stringify({ ...makeSite(), content: { places: [] } }));
    assert.throws(() =>
      execFileSync(process.execPath, [generator.pathname, input, join(dir, 'missing-dates')], {
        stdio: 'pipe',
      }),
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test('date validation rejects impossible, partial, reversed and excessive ranges', () => {
  for (const dates of [
    { start: '2027-02-29', end: '2027-03-01' },
    { start: '2027-01-01', end: undefined },
    { start: '2027-06-02', end: '2027-06-01' },
    { start: '2027-01-01', end: '2029-01-01' },
  ]) {
    assert.throws(() => validateSite({ ...makeSite(), content: { ...dates, places: [] } }));
  }
});
