import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const { chromium } = await import(process.env.PLAYWRIGHT_CORE_MODULE || 'playwright-core');
const generator = resolve(fileURLToPath(new URL('../../', import.meta.url)));
const scratch = await mkdtemp(join(tmpdir(), 'web-kit-app-'));
const paths = new Map([['wizard', generator]]);
const title = 'Mein fiktiver Ideenplaner';
const data = { purpose: 'Ideen sammeln und Aufgaben abschliessen.', audience: 'Eine Person', title, id: 'ideenplaner', color: '#225e4a' };
const mime = new Map([
  ['.html', 'text/html; charset=utf-8'], ['.js', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css'], ['.json', 'application/json'], ['.webmanifest', 'application/manifest+json'],
  ['.png', 'image/png'], ['.svg', 'image/svg+xml'],
]);
const server = createServer(async (request, response) => {
  try {
    const [, first, ...rest] = new URL(request.url, 'http://localhost').pathname.split('/');
    const root = paths.get(first);
    const path = decodeURIComponent(rest.join('/'));
    const file = resolve(root, path && !path.endsWith('/') ? path : path + 'index.html');
    if (!file.startsWith(root + sep)) throw Error('Unzulässiger Pfad');
    const bytes = await readFile(file);
    response.writeHead(200, { 'Content-Type': mime.get(extname(file)) ?? 'application/octet-stream' });
    response.end(bytes);
  } catch {
    response.writeHead(404).end();
  }
});
let browser;

try {
  for (const [name, mode] of [['app', 'app'], ['other', 'app'], ['hybrid', 'hybrid'], ['website', 'website']]) {
    const brief = join(scratch, name + '.json');
    const destination = join(scratch, name);
    await writeFile(brief, JSON.stringify({ ...data, mode }));
    execFileSync(process.execPath, [join(generator, 'scripts/create.mjs'), '--brief', brief, destination]);
    paths.set(name, destination);
  }
  const collectionBrief = join(scratch, 'collection.json');
  await writeFile(collectionBrief, JSON.stringify({
    purpose: 'Bücher sammeln und wiederfinden.', plannerProfile: 'collection',
    title: 'Meine Büchersammlung', id: data.id,
  }));
  for (const name of ['collection', 'collection-other']) {
    const destination = join(scratch, name);
    execFileSync(process.execPath, [join(generator, 'scripts/create.mjs'), '--brief', collectionBrief, destination]);
    paths.set(name, destination);
  }
  const appConfig = await readFile(join(paths.get('app'), 'site.json'));
  assert.deepEqual(await readFile(join(paths.get('other'), 'site.json')), appConfig);
  assert.throws(
    () => execFileSync(process.execPath, [
      join(generator, 'scripts/create.mjs'), '--brief', join(scratch, 'app.json'), paths.get('app'),
    ], { stdio: 'pipe' }),
    error => error.status === 1 && /Ziel existiert bereits/.test(error.stderr.toString()),
  );
  assert.deepEqual(await readFile(join(paths.get('app'), 'site.json')), appConfig);
  await new Promise((resolve, reject) => server.listen(0, '127.0.0.1', resolve).once('error', reject));
  const base = 'http://127.0.0.1:' + server.address().port + '/';
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_EXECUTABLE,
    args: ['--no-sandbox'],
  });

  for (const width of [390, 1280]) {
    const profile = await browser.newContext({
      viewport: { width, height: 820 }, isMobile: width === 390, hasTouch: width === 390,
    });
    profile.setDefaultTimeout(10000);
    const page = await profile.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(base + 'app/');
    const input = page.getByRole('textbox', { name: 'Titel' });
    const save = page.getByRole('button', { name: 'Eintrag erfassen' });
    const status = page.locator('#planner-status');
    await input.fill('Bücherliste');
    await page.getByRole('combobox', { name: 'Art' }).selectOption('task');
    await save.click();
    await page.getByRole('heading', { name: 'Bücherliste' }).waitFor();

    await page.getByRole('button', { name: 'Bearbeiten: Bücherliste' }).click();
    await input.fill('Leseliste');
    await page.getByRole('button', { name: 'Änderungen speichern' }).click();
    await page.getByRole('heading', { name: 'Leseliste' }).waitFor();
    await page.getByRole('button', { name: 'Abschliessen: Leseliste' }).click();
    await page.getByRole('button', { name: 'Wieder öffnen: Leseliste' }).waitFor();
    await page.getByRole('combobox', { name: 'Filter' }).selectOption('open');
    await page.getByText('Keine Einträge für diesen Filter.').waitFor();
    await page.getByRole('combobox', { name: 'Filter' }).selectOption('done');
    await page.getByRole('heading', { name: 'Leseliste' }).waitFor();

    const manifest = await page.evaluate(() => fetch(document.querySelector('link[rel=manifest]').href).then(r => r.json()));
    assert.equal(manifest.display, 'standalone');
    assert.equal(manifest.start_url, './');
    assert.equal(manifest.id, './?project=ideenplaner');
    assert.deepEqual(manifest.icons.map(icon => icon.sizes), ['192x192', '512x512']);
    assert.ok((await page.request.get(base + 'app/apple-touch-icon.png')).ok());
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width);
    await page.waitForFunction(() => !!navigator.serviceWorker.controller);
    const cacheKeys = await page.evaluate(() => caches.keys());
    assert.ok(cacheKeys.some(key => key.includes('/app/:ideenplaner:')));
    await profile.setOffline(true);
    await page.reload();
    await page.getByRole('button', { name: 'Wieder öffnen: Leseliste' }).waitFor();
    await profile.setOffline(false);

    await page.getByText('Daten und Backup', { exact: true }).click();
    const exported = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Backup herunterladen' }).click();
    const backup = await readFile(await (await exported).path());
    const importFile = page.locator('#planner-import');
    await importFile.setInputFiles({ name: 'kaputt.json', mimeType: 'application/json', buffer: Buffer.from('{') });
    await status.filter({ hasText: 'Import fehlgeschlagen' }).waitFor();
    await page.getByRole('heading', { name: 'Leseliste' }).waitFor();
    page.once('dialog', dialog => dialog.dismiss());
    await importFile.setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: backup });
    await status.filter({ hasText: 'Import abgebrochen' }).waitFor();
    await page.getByRole('heading', { name: 'Leseliste' }).waitFor();

    const other = await profile.newPage();
    await other.goto(base + 'other/');
    await other.getByRole('textbox', { name: 'Titel' }).fill('Anderer Installationspfad');
    assert.equal(await other.getByRole('heading', { name: 'Leseliste' }).count(), 0);
    await other.getByText('Daten und Backup', { exact: true }).click();
    await other.locator('#planner-import').setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: backup });
    await other.getByRole('button', { name: 'Wieder öffnen: Leseliste' }).waitFor();

    if (width === 1280) {
      // Two tabs on the same installation append without losing each other's transaction.
      const secondTab = await profile.newPage();
      await secondTab.goto(base + 'app/');
      await Promise.all([
        input.fill('Erster Tab'),
        secondTab.getByRole('textbox', { name: 'Titel' }).fill('Zweiter Tab'),
      ]);
      await Promise.all([
        save.click(),
        secondTab.getByRole('button', { name: 'Eintrag erfassen' }).click(),
      ]);
      await page.getByRole('heading', { name: 'Erster Tab' }).waitFor();
      await secondTab.getByRole('heading', { name: 'Zweiter Tab' }).waitFor();
      await page.reload();
      await page.getByRole('heading', { name: 'Erster Tab' }).waitFor();
      await page.getByRole('heading', { name: 'Zweiter Tab' }).waitFor();

      await page.goto(base + 'hybrid/');
      await page.getByRole('link', { name: 'Mein Planer' }).click();
      assert.equal(new URL(page.url()).hash, '#planner');
      await page.getByRole('heading', { name: 'Für wen' }).waitFor();
      await page.goto(base + 'website/');
      await page.getByRole('heading', { name: 'Für wen' }).waitFor();
      assert.equal(await page.getByRole('heading', { name: 'Mein Planer' }).count(), 0);
      assert.ok(!(await page.evaluate(() => performance.getEntriesByType('resource').map(r => r.name))).some(url => url.endsWith('/planner.js')));

      await page.goto(base + 'wizard/admin/');
      await page.locator('select[name=mode] option[value=app]').waitFor({ state: 'attached' });
      const siteJson = await readFile(join(paths.get('app'), 'site.json'));
      await page.locator('#site-import').setInputFiles({ name: 'site.json', mimeType: 'application/json', buffer: siteJson });
      await page.getByText('Konfiguration importiert. Bitte prüfen.').waitFor();
      assert.equal(await page.locator('select[name=mode]').inputValue(), 'app');
      await page.getByRole('button', { name: 'Konfiguration prüfen' }).click();
      const download = page.waitForEvent('download');
      await page.getByRole('button', { name: 'Website erstellen' }).click();
      const archive = await (await download).path();
      const exportedSite = execFileSync('unzip', ['-p', archive, 'site.json']);
      assert.deepEqual(JSON.parse(exportedSite), JSON.parse(siteJson));
      assert.match(execFileSync('unzip', ['-p', archive, 'index.html'], { encoding: 'utf8' }), /noindex,nofollow/);
    }

    await page.goto(base + 'collection/');
    await page.getByRole('heading', { name: 'Meine Sammlung' }).waitFor();
    assert.equal(await page.getByLabel('Art', { exact: true }).isVisible(), false);
    const addBook = async (name, category, note) => {
      await input.fill(name);
      await page.getByLabel('Kategorie', { exact: true }).fill(category);
      await page.getByLabel('Notiz').fill(note);
      await save.click();
      await page.getByRole('heading', { name }).waitFor();
    };
    await addBook('Bergwege', 'Reisen', 'Route über den Alpenpass');
    await addBook('Stadtgärten', 'Sachbuch', 'Tipps für den Balkon');
    const search = page.getByRole('searchbox', { name: 'Suche' });
    const category = page.getByRole('combobox', { name: 'Kategorie filtern' });
    await search.fill('ALPENPASS');
    assert.equal(await page.getByRole('heading', { name: 'Bergwege' }).count(), 1);
    assert.equal(await page.getByRole('heading', { name: 'Stadtgärten' }).count(), 0);
    await search.fill('');
    await category.selectOption({ label: 'Sachbuch' });
    assert.equal(await page.getByRole('heading', { name: 'Bergwege' }).count(), 0);
    await page.getByRole('button', { name: 'Bearbeiten: Stadtgärten' }).click();
    await page.getByLabel('Notiz').fill('Tipps für den Innenhof');
    await page.getByRole('button', { name: 'Änderungen speichern' }).click();
    await page.getByText('Notiz · Tipps für den Innenhof').waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width);
    await page.waitForFunction(() => !!navigator.serviceWorker.controller);
    const collectionCaches = await page.evaluate(() => caches.keys());
    assert.ok(collectionCaches.some(key => key.includes('/collection/:ideenplaner:')));
    assert.ok(collectionCaches.some(key => key.includes('/app/:ideenplaner:')));
    await profile.setOffline(true);
    await page.reload();
    await page.getByText('Notiz · Tipps für den Innenhof').waitFor();
    await profile.setOffline(false);

    await page.getByText('Daten und Backup', { exact: true }).click();
    const collectionExport = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Backup herunterladen' }).click();
    const collectionBackup = await readFile(await (await collectionExport).path());
    assert.equal(JSON.parse(collectionBackup).profile, 'collection');
    await importFile.setInputFiles({ name: 'planer.json', mimeType: 'application/json', buffer: backup });
    await status.filter({ hasText: 'anderen App-Profil' }).waitFor();
    await page.getByRole('heading', { name: 'Stadtgärten' }).waitFor();

    await addBook('Zusätzlicher Eintrag', 'Sonstiges', 'Bleibt ohne Bestätigung erhalten');
    page.once('dialog', dialog => dialog.dismiss());
    await importFile.setInputFiles({ name: 'sammlung.json', mimeType: 'application/json', buffer: collectionBackup });
    await status.filter({ hasText: 'Import abgebrochen' }).waitFor();
    await page.getByRole('heading', { name: 'Zusätzlicher Eintrag' }).waitFor();
    page.once('dialog', dialog => dialog.accept());
    await importFile.setInputFiles({ name: 'sammlung.json', mimeType: 'application/json', buffer: collectionBackup });
    await status.filter({ hasText: 'Einträge wiederhergestellt' }).waitFor();
    assert.equal(await page.getByRole('heading', { name: 'Zusätzlicher Eintrag' }).count(), 0);

    await other.goto(base + 'collection-other/');
    await other.getByRole('textbox', { name: 'Titel' }).fill('Separater Installationspfad');
    assert.equal(await other.getByRole('heading', { name: 'Stadtgärten' }).count(), 0);
    await other.getByText('Daten und Backup', { exact: true }).click();
    await other.locator('#planner-import').setInputFiles({
      name: 'sammlung.json', mimeType: 'application/json', buffer: collectionBackup,
    });
    await other.getByText('Notiz · Tipps für den Innenhof').waitFor();

    await page.goto(base + 'wizard/ai/etappe-1.html');
    const assistant = page.locator('.wk-assistant');
    const question = assistant.getByRole('textbox', { name: 'Deine Frage oder dein Auftrag' });
    await question.fill('Wo endet die Etappe und wo ist die GPX-Datei?');
    await question.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement?.tagName), 'BUTTON');
    await assistant.getByRole('button', { name: 'Senden' }).click();
    await assistant.getByText(/endet in Birkenhafen/).waitFor();
    await assistant.getByText(/keine GPX-Datei zum Download/).waitFor();
    assert.match(await assistant.getByRole('link', { name: 'Etappenübersicht' }).getAttribute('href'), /etappe-1.html#etappeninfo$/);
    const route = assistant.getByRole('link', { name: 'Route und GPX' });
    assert.match(await route.getAttribute('href'), /etappe-1.html#gpx$/);
    await question.fill('Wie weit ist es bis dort?');
    await assistant.getByRole('button', { name: 'Senden' }).click();
    await assistant.getByText(/14 km lang/).waitFor();
    await page.getByRole('link', { name: 'Etappe 2' }).click();
    await assistant.getByRole('button', { name: /Wo endet die Etappe/ }).click();
    await assistant.getByRole('button', { name: 'Senden' }).click();
    await assistant.getByText(/endet in Lindenbrück/).waitFor();
    assert.match(await route.getAttribute('href'), /etappe-2.html#gpx$/);
    await question.fill('Wie heisst der Zielort?');
    await assistant.getByRole('button', { name: 'Senden' }).click();
    await assistant.getByText(/endet in Lindenbrück/).waitFor();
    assert.match(await assistant.getByRole('link', { name: 'Etappenübersicht' }).getAttribute('href'), /etappe-2.html#etappeninfo$/);
    assert.equal(await route.count(), 0);
    await question.fill('Kann ich die Hotelliste als Datei herunterladen?');
    await assistant.getByRole('button', { name: 'Senden' }).click();
    await assistant.getByText(/keine freigegebene Angabe/).waitFor();
    assert.equal(await assistant.getByRole('link').count(), 0);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width);

    await page.getByRole('link', { name: 'Wizard-Demo' }).click();
    const preview = page.locator('[data-ai-preview]');
    await question.fill('Ich brauche eine Übersicht für unser Material mit Zustand und Anzahl.');
    await assistant.getByRole('button', { name: 'Senden' }).click();
    await assistant.getByText(/manuelle Formular unter dem Assistenten/).waitFor();
    const propose = async name => {
      await assistant.getByRole('button', { name }).click();
      await assistant.getByRole('button', { name: 'Senden' }).click();
      await assistant.getByRole('button', { name: 'Vorschlag übernehmen' }).click();
    };
    await propose('Ich möchte meine Padel-Trainings erfassen.');
    await preview.getByRole('heading', { name: 'Padel-Trainings' }).waitFor();
    await preview.getByRole('textbox', { name: 'Titel' }).fill('Aufschlag geübt');
    await preview.getByLabel('Datum').fill('2026-11-07');
    await preview.getByLabel('Dauer in Minuten').fill('75');
    await preview.getByRole('button', { name: 'Eintrag erfassen' }).click();
    await preview.getByRole('heading', { name: 'Aufschlag geübt' }).waitFor();

    await propose('Ergänze die Trainingsart.');
    await preview.getByLabel('Trainingsart').waitFor();
    await preview.getByRole('heading', { name: 'Aufschlag geübt' }).waitFor();
    await preview.getByRole('button', { name: 'Bearbeiten: Aufschlag geübt' }).click();
    await preview.getByLabel('Trainingsart').fill('Technik');
    await preview.getByRole('button', { name: 'Änderungen speichern' }).click();
    await preview.getByText('Trainingsart · Technik').waitFor();
    await page.getByRole('button', { name: 'KI-Änderung rückgängig' }).click();
    await preview.getByLabel('Trainingsart').waitFor({ state: 'detached' });
    await preview.getByRole('heading', { name: 'Aufschlag geübt' }).waitFor();
    await propose('Ergänze die Trainingsart.');
    await preview.getByText('Trainingsart · Technik').waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width);
    await page.getByRole('button', { name: 'Konfiguration prüfen' }).click();
    await page.locator('#wizard input[name=title]').fill('Padel-Tagebuch');
    await page.getByText(/Interaktive Vorschau zeigt den letzten geprüften Stand/).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Website erstellen' }).isEnabled(), false);
    await page.getByRole('button', { name: 'Konfiguration prüfen' }).click();
    await preview.getByRole('heading', { name: 'Padel-Tagebuch' }).waitFor();
    await preview.getByText('Trainingsart · Technik').waitFor();
    assert.equal(await preview.getByRole('heading', { name: 'Aufschlag geübt' }).count(), 1);
    const aiDownload = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Website erstellen' }).click();
    const aiArchive = await (await aiDownload).path();
    const aiSite = JSON.parse(execFileSync('unzip', ['-p', aiArchive, 'site.json']));
    assert.equal(aiSite.mode, 'app');
    assert.equal(aiSite.title, 'Padel-Tagebuch');
    assert.equal(aiSite.plannerFields.at(-1).id, 'trainingsart');
    assert.doesNotMatch(JSON.stringify(aiSite), /Aufschlag geübt/);

    await page.goto(base + 'wizard/admin/');
    await propose('Ich möchte meine Bücher sammeln und wiederfinden.');
    await preview.getByRole('heading', { name: 'Meine Sammlung' }).waitFor();
    await preview.getByLabel('Kategorie', { exact: true }).waitFor();
    assert.equal(await page.locator('select[name=plannerProfile]').inputValue(), 'collection');
    await page.getByText('Titel · Kategorie · Notiz').waitFor();
    await page.getByRole('button', { name: 'Konfiguration prüfen' }).click();
    const collectionZip = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Website erstellen' }).click();
    const collectionArchive = await (await collectionZip).path();
    const collectionSite = JSON.parse(execFileSync('unzip', ['-p', collectionArchive, 'site.json']));
    assert.equal(collectionSite.plannerProfile, 'collection');
    assert.equal(collectionSite.mode, 'app');

    assert.deepEqual(errors, []);
    console.log(width + ' px: Planer, Sammlung, Backup, Offline, Speicherisolation und KI-Demos bestanden.');
    await profile.close();
  }
} finally {
  await browser?.close();
  server.close();
  await rm(scratch, { recursive: true, force: true });
}
