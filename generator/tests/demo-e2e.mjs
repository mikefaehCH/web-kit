import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync as execute } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
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
