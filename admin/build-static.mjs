import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
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
const scriptMarker = '<script type="module" src="./whatsapp.js"></script>';
if (!html.includes(scriptMarker)) throw new Error('Missing WhatsApp script marker in whatsapp.html');
const whatsapp = await readFile(join(root, 'whatsapp.js'));
const whatsappName = `whatsapp.${createHash('sha256').update(whatsapp).digest('hex').slice(0, 12)}.js`;
await writeFile(join(output, whatsappName), whatsapp);
await writeFile(join(output, 'whatsapp.html'), html
  .replace(marker, `<meta name="web-kit-deployment" content="${encodeURIComponent(deploymentJson)}">`)
  .replace(scriptMarker, `<script type="module" src="./${whatsappName}"></script>`));
// Render serves the service root from index.html. Forward it to the single
// canonical admin entry so login and auth redirects keep one URL. No script
// is needed, so the existing CSP stays unchanged.
await writeFile(join(output, 'index.html'), `<!doctype html>
<html lang="de-CH">
<head>
<meta charset="utf-8">
<meta name="robots" content="noindex, nofollow">
<meta http-equiv="refresh" content="0; url=./whatsapp.html">
<title>Web-Kit Verwaltung</title>
</head>
<body>
<p><a href="./whatsapp.html">Zur Web-Kit Verwaltung</a></p>
</body>
</html>
`);
await writeFile(join(output, 'deployment.json'), `${deploymentJson}\n`, { encoding: 'utf8', mode: 0o644 });
