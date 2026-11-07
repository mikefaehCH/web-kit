import { cp, mkdir, readFile, writeFile, realpath } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { basename, dirname, resolve, relative, isAbsolute, sep } from 'node:path';
import { trips } from '../config.js';
import { makeSiteFromBrief, validateSite } from '../admin/site-schema.js';

const [mode, input, output] = process.argv.slice(2);
const brief = mode === '--brief';
const example = brief ? input : mode;
const destination = brief ? output : input;
const projectId = output;
const fromConfig = brief || example?.endsWith('.json');
const source = fileURLToPath(new URL('../', import.meta.url));

async function prepareTarget(destination) {
  if (!destination) throw Error('Zielordner fehlt');
  const target = resolve(destination);
  const rel = relative(
    await realpath(source),
    resolve(await realpath(dirname(target)), basename(target)),
  );
  if (!rel || (rel !== '..' && !rel.startsWith('..' + sep) && !isAbsolute(rel)))
    throw Error('Ziel darf nicht in der Vorlage liegen');
  return target;
}

async function createTarget(target) {
  try {
    await mkdir(target);
  } catch (error) {
    if (error.code === 'EEXIST')
      throw Error('Ziel existiert bereits; es wird nichts überschrieben: ' + target);
    throw error;
  }
}

if (fromConfig) {
  try {
    if (!example) throw Error('Kurzbriefing fehlt');
    const parsed = JSON.parse(await readFile(example, 'utf8'));
    const site = brief ? makeSiteFromBrief(parsed) : validateSite(parsed);
    const { TEMPLATE_FILES, generateProject } = await import('../modules/site-generator.js');
    const target = await prepareTarget(destination);
    const templates = new Map(
      await Promise.all(
        TEMPLATE_FILES.map(async (path) => [
          path,
          new Uint8Array(await readFile(resolve(source, path))),
        ]),
      ),
    );
    const projectFiles = generateProject(site, templates);
    await createTarget(target);
    for (const [path, bytes] of projectFiles) {
      await mkdir(resolve(target, path, '..'), { recursive: true });
      await writeFile(resolve(target, path), bytes, { flag: 'wx' });
    }
    console.log('Website erstellt: ' + target);
    process.exit(0);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
if (
  !Object.hasOwn(trips, example || '') ||
  !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(projectId || '') ||
  !destination
) {
  console.error(
    'Aufruf: node scripts/create.mjs [--brief] datei.json /neuer/ordner (oder city|walking /neuer/ordner projekt-id)',
  );
  process.exit(1);
}
const target = await prepareTarget(destination);
await createTarget(target);
const files = [
  'admin',
  'categories',
  'templates',
  'docs',
  'index.html',
  'app.js',
  'style.css',
  'icon.svg',
  'icon-192.png',
  'icon-512.png',
  'apple-touch-icon.png',
  'manifest.webmanifest',
  'sw.js',
  'modules',
  'trips',
  'vendor',
  'package.json',
  'tests',
  'scripts',
  'README.md',
  'CLOUD_MODULES.md',
];
for (const file of files)
  await cp(resolve(source, file), resolve(target, file), {
    recursive: true,
    force: false,
    errorOnExist: true,
  });
const config = `import example from './trips/${example}.js';\nexport const trips = { ${example}: { ...example, id: ${JSON.stringify(projectId)} } };\nexport const defaultTrip = '${example}';\n`;
await writeFile(resolve(target, 'config.js'), config);
const manifest = JSON.parse(await readFile(resolve(target, 'manifest.webmanifest'), 'utf8'));
manifest.name = trips[example].title;
manifest.short_name = 'Meine Reise';
manifest.theme_color = trips[example].color;
await writeFile(resolve(target, 'manifest.webmanifest'), JSON.stringify(manifest, null, 2) + '\n');
console.log(
  `Vorlage erstellt: ${target}\nNächster Schritt: trips/${example}.js bearbeiten; Beispieldaten ausdrücklich ersetzen.\nPrüfen: cd ${target} und npm test. Bereitstellung über HTTPS oder localhost.`,
);
