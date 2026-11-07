import { validateSite } from '../admin/site-schema.js';
import { validateTrip } from './config.js';
import { CATEGORY_FILES, CATEGORY_REGISTRY } from '../categories/registry.js';

// Feste öffentliche Vorlage. Konfigurationswerte dürfen niemals Dateipfade bestimmen.
export const TEMPLATE_FILES = Object.freeze([
  ...CATEGORY_FILES,
  'templates/dated-places/index.html',
  'templates/dated-places/app.js',
  'templates/sections/index.html',
  'templates/sections/app.js',
  'index.html',
  'app.js',
  'style.css',
  'icon.svg',
  'icon-192.png',
  'icon-512.png',
  'apple-touch-icon.png',
  'manifest.webmanifest',
  'sw.js',
  'package.json',
  'modules/config.js',
  'modules/travel-view.js',
  'modules/state.js',
  'modules/places.js',
  'modules/map.js',
  'modules/project-auth.js',
  'modules/shared-plan.js',
  'modules/site-generator.js',
  'modules/zip.js',
  'modules/planner.js',
  'modules/sections-renderer.js',
  'modules/planner-state.js',
  'modules/planner-profiles.js',
  'admin/site-schema.js',
  'admin/index.html',
  'admin/wizard.js',
  'admin/wizard-ai.js',
  'admin/wizard-ai-settings.js',
  'ai/widget.js',
  'ai/widget.css',
  'ai/wizard-contract.js',
  'admin/bootstrap.js',
  'admin/wizard.css',
  'scripts/create.mjs',
  'tests/project-modules.mjs',
  'README.md',
  'CLOUD_MODULES.md',
  'docs/neue-kategorie.md',
  'vendor/leaflet/leaflet.js',
  'vendor/leaflet/leaflet.css',
  'vendor/leaflet/LICENSE',
  'vendor/leaflet/images/layers.png',
  'vendor/leaflet/images/layers-2x.png',
  'vendor/leaflet/images/marker-icon.png',
  'vendor/leaflet/images/marker-icon-2x.png',
  'vendor/leaflet/images/marker-shadow.png',
]);
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });
const encode = (value) => encoder.encode(value);
const json = (value) => JSON.stringify(value, null, 2) + '\n';
const escapeHtml = (value) =>
  value.replace(
    /[&<>"']/g,
    (char) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      })[char],
  );

export function generateProject(input, templates) {
  const site = validateSite(input);
  const output = new Map();
  for (const path of TEMPLATE_FILES) {
    const bytes = templates.get(path);
    if (!(bytes instanceof Uint8Array) || bytes.length > 2000000)
      throw Error('Vorlagendatei fehlt oder ist ungültig: ' + path);
    output.set(path, bytes.slice());
  }
  const text = (path) => decoder.decode(output.get(path));
  const put = (path, content) => output.set(path, encode(content));
  const definition = CATEGORY_REGISTRY.find((item) => item.id === site.category);
  const isTravel = definition.contract === 'dated-places';
  const withPlanner = !!site.mode;
  const trip = isTravel ? validateTrip({ ...site, ...site.content }) : null;
  put('site.json', json(site));
  put(
    'config.js',
    isTravel
      ? `export const site = ${JSON.stringify(site)};\nexport const trips = { ${JSON.stringify(site.preset)}: ${JSON.stringify(trip)} };\nexport const defaultTrip = ${JSON.stringify(site.preset)};\n`
      : `export const site = ${JSON.stringify(site)};\nexport const trips = {};\nexport const defaultTrip = '';\n`,
  );
  put('app.js', text('templates/' + definition.contract + '/app.js'));
  const manifest = JSON.parse(text('manifest.webmanifest'));
  Object.assign(manifest, {
    name: site.title,
    short_name: Array.from(site.title).slice(0, 24).join(''),
    theme_color: site.color,
  });
  if (withPlanner) manifest.id = './?project=' + site.id;
  put('manifest.webmanifest', json(manifest));
  put(
    'index.html',
    text('templates/' + definition.contract + '/index.html')
      .replace('<head>', site.mode === 'app' ? '<head>\n    <meta name="robots" content="noindex,nofollow" />' : '<head>')
      .replace(/<html lang="[^"]*">/, () => '<html lang="' + site.locale + '">')
      .replace(
        /(<meta\s+name="theme-color"\s+content=")[^"]*("\s*\/>)/,
        (_, a, b) => a + site.color + b,
      )
      .replace(/<title>[\s\S]*?<\/title>/, () => '<title>' + escapeHtml(site.title) + '</title>')
      .replace(
        /(<meta\s+name="description"\s+content=")[^"]*("\s*\/>)/,
        (_, a, b) => a + escapeHtml(site.description) + b,
      ),
  );
  let worker = text('sw.js').replace(/  '\.\/trips\/(city|walking)\.js',\n/g, '');
  if (!isTravel) worker = worker.replace("const CACHE = PREFIX + 'v3';", "const CACHE = PREFIX + 'v5';");
  if (!isTravel && !withPlanner) {
    worker = worker.replace("  './modules/state.js',", "  './modules/state.js',\n  './modules/sections-renderer.js',\n  './modules/planner-profiles.js',");
  }
  if (withPlanner) {
    worker = worker
      .replace("const PREFIX = 'travel-shell:' + self.registration.scope + ':';",
        "const PREFIX = 'planner-shell:' + self.registration.scope + ':' + " + JSON.stringify(site.id + ':') + ';')
      .replace(/const ASSETS = \[.*?\];/s, 'const ASSETS = ' + JSON.stringify([
        './', './index.html', './app.js', './config.js', './style.css', './manifest.webmanifest',
        './icon.svg', './icon-192.png', './icon-512.png', './apple-touch-icon.png',
        './modules/planner.js', './modules/planner-state.js', './modules/planner-profiles.js', './modules/sections-renderer.js',
      ], null, 2) + ';')
      .replace(
        "!response.headers.get('cache-control')?.includes('no-store')",
        "!/(?:^|,)\\s*(?:private|no-store)\\b/i.test(response.headers.get('cache-control') || '')",
      );
  }
  put('sw.js', worker);
  put(
    'README.md',
    '# Generierte Website\n\nsite.json ist die Konfigurationsquelle. Neu generieren: `node scripts/create.mjs site.json /neues/ziel`. Bestehende Ziele werden nicht überschrieben. Keine Beispieldaten oder Cloud-Autorisierung enthalten.\n\nNode 22+: `npm ci --ignore-scripts`, `npm test`. Lokal mit einem statischen HTTP-Server starten; für Veröffentlichung HTTPS verwenden. Der Wizard unter admin/ kann ebenfalls ein vollständiges ZIP exportieren. Keine Anmeldung erforderlich.\n' +
      (withPlanner
        ? '\nPlanereinträge liegen im Browserprofil. Backups über die App exportieren und importieren. Eine persönliche Vorschau auf localhost oder mit serverseitigem Zugriffsschutz öffnen.\n'
        : ''),
  );
  put(
    'tests/generated.mjs',
    `import test from 'node:test';\nimport assert from 'node:assert/strict';\nimport { site, trips, defaultTrip } from '../config.js';\nimport { validateSite } from '../admin/site-schema.js';\nimport { validateTrip } from '../modules/config.js';\ntest('generated configuration', () => { assert.equal(validateSite(site).id, ${JSON.stringify(site.id)}); ${isTravel ? 'assert.deepEqual(validateTrip(trips[defaultTrip]).places, site.content.places);' : 'assert.deepEqual(trips, {});'} });\n`,
  );
  const pkg = {
    name: 'web-kit-site',
    private: true,
    type: 'module',
    scripts: { test: 'node --test tests/*.mjs', create: 'node scripts/create.mjs' },
  };
  put('package.json', json(pkg));
  put(
    'package-lock.json',
    json({
      name: pkg.name,
      lockfileVersion: 3,
      requires: true,
      packages: { '': { name: pkg.name } },
    }),
  );
  return output;
}

export async function loadBrowserTemplates(base, fetchFile = globalThis.fetch) {
  const entries = await Promise.all(
    TEMPLATE_FILES.map(async (path) => {
      const response = await fetchFile(new URL(path, base), {
        credentials: 'omit',
        cache: 'no-store',
        redirect: 'error',
      });
      if (!response.ok) throw Error('Vorlage konnte nicht geladen werden: ' + path);
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.length > 2000000) throw Error('Vorlagendatei zu gross');
      return [path, bytes];
    }),
  );
  return new Map(entries);
}
