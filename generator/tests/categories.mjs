import test from 'node:test';
import assert from 'node:assert/strict';
import { makeSite, validateSite } from '../admin/site-schema.js';
import { CATEGORY_REGISTRY, validateCatalog } from '../categories/registry.js';
const place = {
  id: 'test-place',
  name: 'Testort',
  category: 'Test',
  description: 'Synthetischer Testinhalt',
  coordinates: [0, 0],
};
const travel = () =>
  makeSite({
    start: '2027-06-01',
    end: '2027-06-03',
    content: { start: '2027-06-01', end: '2027-06-03', places: [place] },
  });
test('v1 city/walking imports normalize to the one v2 model without invented dates/places', () => {
  for (const preset of ['city', 'walking']) {
    const old = {
      version: 1,
      category: preset,
      id: 'legacy',
      title: 'Alt',
      description: 'Beschreibung',
      color: '#965a3e',
      modules: travel().modules,
      start: '2027-06-01',
      end: '2027-06-03',
    };
    const site = validateSite(old);
    assert.equal(site.version, 2);
    assert.equal(site.category, 'travel');
    assert.equal(site.preset, preset);
    assert.equal(site.content.start, old.start);
    assert.deepEqual(site.content.places, []);
    assert.deepEqual(validateSite(JSON.parse(JSON.stringify(site))), site);
    assert.throws(() => validateSite({ ...old, start: undefined }));
    assert.throws(() => validateSite({ ...old, token: 'secret' }));
  }
});
test('general sections require no dates and reject travel data/modules', () => {
  const site = makeSite({
    category: 'general',
    content: { sections: [{ heading: 'Titel', text: '<script>Nur Text</script>' }] },
  });
  assert.equal(site.preset, 'info-page');
  assert.equal(site.content.sections[0].text, '<script>Nur Text</script>');
  assert.equal(Object.hasOwn(site.content, 'start'), false);
  assert.throws(() => validateSite({ ...site, modules: { ...site.modules, map: true } }));
  assert.throws(() => validateSite({ ...site, content: { ...site.content, start: '2027-01-01' } }));
  assert.throws(() => validateSite({ ...site, preset: 'city' }));
  assert.throws(() =>
    validateSite({ ...site, content: { sections: [{ heading: '', text: 'Test' }] } }),
  );
});
test('places validate IDs, bounds, text limits, duplicates and unknown fields', () => {
  const site = travel();
  assert.ok(Object.isFrozen(site.content.places[0].coordinates));
  for (const places of [
    [place, place],
    [{ ...place, coordinates: [91, 0] }],
    [{ ...place, coordinates: ['0', 0] }],
    [{ ...place, id: '../bad' }],
    [{ ...place, token: 'secret' }],
    [{ ...place, description: 'x'.repeat(1001) }],
  ])
    assert.throws(() => validateSite({ ...site, content: { ...site.content, places } }));
});
test('category removal and adding a metadata-only category preserve the core', () => {
  const general = CATEGORY_REGISTRY.filter((item) => item.id === 'general');
  assert.equal(validateSite(makeSite({ category: 'general' }), general).category, 'general');
  assert.throws(() => validateSite(travel(), general));
  const added = validateCatalog(
    ['custom'],
    [
      {
        id: 'custom',
        label: 'Test',
        contract: 'sections',
        presets: [{ id: 'info', label: 'Test' }],
        modules: ['offline'],
      },
    ],
  );
  const input = { ...makeSite({ category: 'general' }), category: 'custom', preset: 'info' };
  assert.equal(validateSite(input, added).category, 'custom');
  assert.throws(() => validateCatalog(['../bad'], []));
  assert.throws(() => validateCatalog(['a', 'a'], []));
  assert.throws(() =>
    validateCatalog(
      ['x'],
      [
        {
          id: 'x',
          label: 'X',
          contract: 'sections',
          presets: [{ id: 'a', label: 'A' }],
          modules: ['map'],
        },
      ],
    ),
  );
});
