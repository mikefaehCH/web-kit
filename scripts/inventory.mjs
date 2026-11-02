import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchInventory, renderMarkdown } from './inventory-core.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const config = JSON.parse(await readFile(new URL('../platform/projects.json', import.meta.url), 'utf8'));
const args = process.argv.slice(2);
if (args.length !== 2 || args.some((value) => value.startsWith('-'))) {
  console.error('Aufruf: node scripts/inventory.mjs <report.json> <report.md>');
  process.exitCode = 2;
} else {
  const token = process.env.GITHUB_TOKEN;
  const fetchJson = async (path) => {
    const url = new URL(path, 'https://api.github.com');
    if (url.origin !== 'https://api.github.com') throw new Error('Ungültiger API-Host');
    const response = await fetch(url, {
      redirect: 'error',
      headers: {
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
    if (!response.ok) throw new Error(`GitHub API ${response.status}: ${url.pathname}`);
    return response.json();
  };
  try {
    const report = await fetchInventory({
      owner: config.owner,
      repositories: config.repositories,
      fetchJson,
      generatedAt: new Date().toISOString(),
    });
    for (const [path, data] of [[args[0], JSON.stringify(report, null, 2) + '\n'], [args[1], renderMarkdown(report)]]) {
      const output = resolve(root, path);
      await mkdir(dirname(output), { recursive: true });
      await writeFile(output, data, { flag: 'wx' }); // Never overwrite previous baseline silently.
      console.log(`Erstellt: ${output}`);
    }
  } catch (error) {
    // Never log the token, raw GitHub responses or private content.
    console.error(`Inventar fehlgeschlagen: ${error.message}`);
    process.exitCode = 1;
  }
}
