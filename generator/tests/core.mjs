import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import city from '../trips/city.js';
import walking from '../trips/walking.js';
import { validateTrip, daysFor } from '../modules/config.js';
import { filterPlaces } from '../modules/places.js';
import { storageKey, emptyState, normalizeState, readState, writeState, exportState, importState } from '../modules/state.js';
const source = fileURLToPath(new URL('../', import.meta.url));

for (const trip of [city, walking]) {
  test(trip.id + ': Datum, Orte, Filter und Backup', () => {
    assert.equal(validateTrip(trip), trip);
    assert.equal(daysFor(trip).length, 3);
    assert.equal(filterPlaces(trip.places, { query: trip.places[0].name }).length, 1);
    assert.equal(filterPlaces(trip.places, { favorites: [] }).length, 0);
    assert.equal(filterPlaces(trip.places, { category: trip.places[0].category }).every(place => place.category === trip.places[0].category), true);
    const state = { version: 1, favorites: [trip.places[0].id], plan: [{ placeId: trip.places[0].id, day: trip.start }] };
    assert.deepEqual(importState(exportState(trip, state), trip), state);
    assert.throws(() => importState(exportState(trip === city ? walking : city, state), trip));
  });
}
test('Validierung lehnt doppelte IDs, ungültige Koordinaten und Daten ab', () => {
  for (const changed of [
    { ...city, places: [...city.places, city.places[0]] },
    { ...city, start: '2028-02-31' },
    { ...city, end: '2027-01-01' },
    { ...city, modules: { auth: true } },
    { ...city, places: [{ ...city.places[0], coordinates: [91, 0] }] },
  ]) assert.throws(() => validateTrip(changed));
});
test('Beschädigter Speicher und fehlende Speicherrechte brechen die App nicht', () => {
  assert.deepEqual(readState({ getItem: () => '{' }, city), emptyState());
  assert.deepEqual(readState({ getItem: () => { throw Error(); } }, city), emptyState());
  assert.equal(writeState({ setItem: () => { throw Error(); } }, city, emptyState()), false);
  assert.deepEqual(normalizeState({ version: 1, favorites: ['unknown'], plan: [{ placeId: 'museum', day: '2030-01-01' }] }, city), emptyState());
});
test('Schlüssel isolieren Projekte und Seitenpfade', () => {
  assert.notEqual(storageKey(city), storageKey(walking));
  assert.notEqual(storageKey(city, '/site-a/'), storageKey(city, '/site-b/'));
});
test('Import lehnt unbekannte Orte, falsche Tage und Duplikate ab', () => {
  for (const plan of [[{ placeId: 'unknown', day: city.start }], [{ placeId: 'museum', day: '1900-01-01' }], [{ placeId: 'museum', day: city.start }, { placeId: 'museum', day: city.start }]]) {
    assert.throws(() => importState(JSON.stringify({ format: 'travel-plan-v1', tripId: city.id, state: { version: 1, favorites: [], plan } }), city));
  }
});
test('Alle Offline-Dateien existieren und beide Beispielreisen sind enthalten', async () => {
  const worker = await readFile(resolve(source, 'sw.js'), 'utf8');
  const list = worker.match(/const ASSETS = (\[[\s\S]*?\]);/)[1];
  // Literal filenames only, no execution of service-worker code.
  const assets = [...list.matchAll(/['"]([^'"]+)['"]/g)].map(match => match[1]);
  assert.ok(assets.includes('./trips/city.js') && assets.includes('./trips/walking.js'));
  for (const path of assets) await access(resolve(source, path));
});
test('Generator liefert eigenständiges Projekt und überschreibt kein Ziel', async () => {
  const directory = await mkdtemp(resolve(tmpdir(), 'travel-starter-'));
  try {
    for (const example of ['city', 'walking']) {
      const target = resolve(directory, example);
      execFileSync(process.execPath, [resolve(source, 'scripts/create.mjs'), example, target, 'test-' + example]);
      const config = await readFile(resolve(target, 'config.js'), 'utf8');
      assert.ok(config.includes('test-' + example));
      await access(resolve(target, 'vendor/leaflet/leaflet.js'));
      assert.equal(await readFile(resolve(target, 'CLOUD_MODULES.md'), 'utf8'), await readFile(resolve(source, 'CLOUD_MODULES.md'), 'utf8'));
      assert.throws(() => execFileSync(process.execPath, [resolve(source, 'scripts/create.mjs'), example, target, 'test-again'], { stdio: 'pipe' }));
    }
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('Service Worker löscht nur eigene Caches und ignoriert private/fremde Requests', async () => {
  const listeners = new Map();
  const deleted = [];
  const scope = 'https://example.test/site-a/';
  let activation;
  const context = {
    self: {
      registration: { scope }, location: { origin: 'https://example.test' },
      addEventListener: (name, listener) => listeners.set(name, listener),
      clients: { claim: async () => {} },
    },
    caches: {
      keys: async () => ['camino-v1', 'sommer2027-v1', 'travel-shell:https://example.test/site-b/:v0', 'travel-shell:' + scope + ':v0', 'travel-shell:' + scope + ':v1', 'travel-shell:' + scope + ':v2'],
      delete: async key => { deleted.push(key); },
    }, URL, Request, Response,
  };
  vm.runInNewContext(await readFile(resolve(source, 'sw.js'), 'utf8'), context);
  listeners.get('activate')({ waitUntil: promise => { activation = promise; } });
  await activation;
  assert.deepEqual(deleted, ['travel-shell:' + scope + ':v0', 'travel-shell:' + scope + ':v1', 'travel-shell:' + scope + ':v2']);
  for (const request of [new Request(scope + 'api/private'), new Request(scope + 'app.js', { headers: { authorization: 'Bearer test' } }), new Request('https://example.test/site-b/app.js'), new Request(scope + 'app.js', { method: 'POST' }), new Request('https://other.test/app.js')]) {
    let intercepted = false;
    listeners.get('fetch')({ request, respondWith: () => { intercepted = true; } });
    assert.equal(intercepted, false, request.url);
  }
});
