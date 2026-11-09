import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const build = fileURLToPath(new URL('../admin/build-static.mjs', import.meta.url));
const dist = (name) => readFileSync(new URL(`../admin/dist/${name}`, import.meta.url), 'utf8');
const commit = 'a'.repeat(40);

test('Render-Root leitet ohne Skript auf den kanonischen Admin-Einstieg weiter', () => {
  execFileSync(process.execPath, [build], { env: { ...process.env, RENDER_GIT_COMMIT: commit, RENDER_GIT_BRANCH: 'main' } });
  const index = dist('index.html');
  assert.match(index, /<meta http-equiv="refresh" content="0; url=\.\/whatsapp\.html">/);
  assert.match(index, /<a href="\.\/whatsapp\.html">/);
  assert.match(index, /<meta name="robots" content="noindex, nofollow">/);
  assert.match(index, /<html lang="de-CH">/);
  // CSP verbietet Inline-Skripte; die Weiterleitung darf keine benötigen.
  assert.doesNotMatch(index, /<script|\son[a-z]+=/i);
});

test('Deployment-Metadaten bleiben im Einstieg und in deployment.json gleich', () => {
  execFileSync(process.execPath, [build], { env: { ...process.env, RENDER_GIT_COMMIT: commit, RENDER_GIT_BRANCH: 'main' } });
  const deployment = JSON.parse(dist('deployment.json'));
  assert.equal(deployment.commit, commit);
  assert.equal(deployment.branch, 'main');
  const meta = dist('whatsapp.html').match(/<meta name="web-kit-deployment" content="([^"]+)">/)?.[1];
  assert.ok(meta, 'Deployment-Marker fehlt in whatsapp.html');
  assert.deepEqual(JSON.parse(decodeURIComponent(meta)), deployment);
});

test('geänderte WhatsApp-Logik erhält eine inhaltsadressierte URL', () => {
  execFileSync(process.execPath, [build], { env: { ...process.env, RENDER_GIT_COMMIT: commit, RENDER_GIT_BRANCH: 'main' } });
  const html = dist('whatsapp.html');
  const script = html.match(/<script type="module" src="\.\/(whatsapp\.[0-9a-f]{12}\.js)"><\/script>/)?.[1];
  assert.ok(script, 'Inhaltsadressierte WhatsApp-Datei fehlt');
  assert.equal(dist(script), readFileSync(new URL('../admin/whatsapp.js', import.meta.url), 'utf8'));
  assert.equal(readdirSync(new URL('../admin/dist/', import.meta.url)).includes('whatsapp.js'), false);
});
