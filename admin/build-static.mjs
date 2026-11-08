import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const output = join(root, 'dist');
const files = [
  'auth.js',
  'navigation.js',
  'auth-policy.js',
  'dashboard.js',
  'dashboard-data.js',
  'whatsapp.css',
  'whatsapp.js',
  'batch-ui.js',
  'vendor/supabase.js',
  'vendor/LICENSES.txt',
];

await rm(output, { recursive: true, force: true });
await mkdir(join(output, 'vendor'), { recursive: true });
for (const relativePath of files) {
  const target = join(output, relativePath);
  await mkdir(dirname(target), { recursive: true });
  await copyFile(join(root, relativePath), target);
}

const renderCommit = process.env.RENDER_GIT_COMMIT;
const renderBranch = process.env.RENDER_GIT_BRANCH;
const deployment = /^[0-9a-f]{40}$/i.test(renderCommit || '')
  ? { commit: renderCommit.toLowerCase(), branch: /^[A-Za-z0-9._/-]{1,100}$/.test(renderBranch || '') ? renderBranch : null, builtAt: new Date().toISOString() }
  : { commit: null, branch: null, builtAt: null };
const deploymentJson = JSON.stringify(deployment);
const html = await readFile(join(root, 'whatsapp.html'), 'utf8');
const marker = '<meta name="web-kit-deployment" content="">';
if (!html.includes(marker)) throw new Error('Missing build metadata marker in whatsapp.html');
const builtHtml = html.replace(marker,
  `<meta name="web-kit-deployment" content="${encodeURIComponent(deploymentJson)}">`);
await writeFile(join(output, 'whatsapp.html'), builtHtml);
// The static site's root URL must serve the same authenticated admin entry point.
await writeFile(join(output, 'index.html'), builtHtml);
await writeFile(join(output, 'deployment.json'), `${deploymentJson}\n`, { encoding: 'utf8', mode: 0o644 });
