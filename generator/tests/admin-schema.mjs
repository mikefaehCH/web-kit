import test from 'node:test';
import assert from 'node:assert/strict';
import { makeSite as makeBaseSite, validateSite } from '../admin/site-schema.js';
const makeSite = (options = {}) =>
  makeBaseSite({ start: '2027-06-01', end: '2027-06-03', ...options });
test('wizard creates a deterministic site.json schema', () => {
  const site = makeSite({ id: 'test-site', title: '  Testseite  ', category: 'walking' });
  assert.equal(site.title, 'Testseite');
  assert.equal(validateSite(JSON.parse(JSON.stringify(site))).id, 'test-site');
  assert.equal(site.modules.offline, true);
});
test('invalid categories, keys and module dependencies are rejected', () => {
  const base = makeSite();
  for (const change of [
    { category: 'admin' },
    { id: '../evil' },
    { title: ' ' },
    { description: '' },
    { color: 'red' },
    { modules: { ...base.modules, map: true, places: false } },
    { extra: 'secret' },
  ]) {
    assert.throws(() => validateSite({ ...base, ...change }));
  }
});
test('HTML injection stays plain text and unknown fields are rejected', () => {
  const site = makeSite({ title: '<img src=x onerror=alert(1)>' });
  assert.equal(site.title, '<img src=x onerror=alert(1)>');
  assert.throws(() => validateSite({ ...site, token: 'private' }));
});
test('wizard schema uses the starter module list and trip categories', async () => {
  const { MODULES } = await import('../modules/config.js');
  const { MODULES: wizardModules, CATEGORIES } = await import('../admin/site-schema.js');
  const { CATEGORY_REGISTRY } = await import('../categories/registry.js');
  assert.equal(wizardModules, MODULES);
  assert.deepEqual(Object.keys(makeSite().modules), [...MODULES]);
  assert.deepEqual([...CATEGORIES].sort(), ['general', 'travel']);
  assert.deepEqual(
    CATEGORY_REGISTRY.find((item) => item.id === 'travel').presets.map((item) => item.id),
    ['city', 'walking'],
  );
});
test('boundaries, versions and malformed values are rejected', () => {
  const base = makeSite();
  assert.equal(validateSite({ ...base, id: 'a'.repeat(64) }).id.length, 64);
  assert.equal(validateSite({ ...base, title: 'T'.repeat(100) }).title.length, 100);
  assert.equal(validateSite({ ...base, description: 'D'.repeat(500) }).description.length, 500);
  for (const change of [
    { version: 99 },
    { id: 'a'.repeat(65) },
    { id: 'Gross' },
    { id: '-start' },
    { title: 'T'.repeat(101) },
    { description: 'D'.repeat(501) },
    { description: 42 },
    { modules: { ...base.modules, planning: true, places: false, map: false } },
    { modules: { ...base.modules, offline: 'yes' } },
    { modules: { ...base.modules, chat: true } },
    { modules: [] },
  ]) {
    assert.throws(() => validateSite({ ...base, ...change }), JSON.stringify(change));
  }
  assert.throws(() =>
    validateSite(JSON.parse(JSON.stringify(base).replace('{', '{"__proto__":{"x":1},'))),
  );
  assert.throws(() => validateSite(null));
});
