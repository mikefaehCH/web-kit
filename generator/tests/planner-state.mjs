import assert from 'node:assert/strict';
import test from 'node:test';
import { makeSiteFromBrief, validateSite } from '../admin/site-schema.js';
import {
  exportPlanner, importPlanner, plannerKey, MAX_BACKUP_BYTES,
} from '../modules/planner-state.js';

const brief = { purpose: 'Ideen sammeln', audience: 'Eine Person' };
const entry = { id: '966110df-2433-4d35-b78c-908ac5f0acb0', title: 'Leseliste', kind: 'idea', done: false };

test('supports personal and combined modes without changing old canonical website files', () => {
  const website = makeSiteFromBrief(brief);
  assert.ok(!Object.hasOwn(website, 'mode'));
  const app = makeSiteFromBrief({ ...brief, mode: 'app' });
  assert.equal(app.mode, 'app');
  assert.deepEqual(app.content.sections, []);
  assert.equal(app.modules.offline, true);
  const hybrid = makeSiteFromBrief({ ...brief, mode: 'hybrid' });
  assert.equal(hybrid.mode, 'hybrid');
  assert.equal(hybrid.content.sections.length, 2);
  assert.deepEqual(validateSite(hybrid), hybrid);
  assert.throws(() => makeSiteFromBrief({ ...brief, mode: 'app', category: 'travel' }), /Modus/);
  assert.throws(() => validateSite({ ...hybrid, mode: 'app' }), /Startansicht/);
  assert.throws(() => makeSiteFromBrief({ ...brief, mode: ['app'] }), /Modus/);
});

test('backup roundtrip, invalid inputs and project storage isolation', () => {
  const backup = exportPlanner('mein-planer', [entry]);
  assert.deepEqual(importPlanner(backup, 'mein-planer'), [entry]);
  assert.throws(() => importPlanner(backup, 'anderer-planer'), /anderen Projekt/);
  assert.throws(() => importPlanner('{', 'mein-planer'), /JSON/);
  assert.throws(() => importPlanner('ä'.repeat(MAX_BACKUP_BYTES / 2 + 1), 'mein-planer'), /gross/);
  const tamper = entries => JSON.stringify({ ...JSON.parse(backup), entries });
  assert.throws(() => importPlanner(tamper([entry, entry]), 'mein-planer'), /doppelte/);
  assert.throws(() => importPlanner(tamper([{ ...entry, title: '   ' }]), 'mein-planer'), /Ungültiger/);
  assert.throws(() => importPlanner(tamper([{ ...entry, kind: ['idea'] }]), 'mein-planer'), /Ungültiger/);
  assert.notEqual(plannerKey('mein-planer', '/eins/'), plannerKey('mein-planer', '/zwei/'));
  assert.notEqual(plannerKey('mein-planer', '/eins/'), plannerKey('anderer-planer', '/eins/'));
});

test('collection briefing supplies its own defaults and preserves legacy planner configurations', () => {
  const site = makeSiteFromBrief({ purpose: 'Bücher wiederfinden', plannerProfile: 'collection' });
  assert.equal(site.mode, 'app');
  assert.equal(site.plannerProfile, 'collection');
  assert.equal(site.modules.offline, true);
  assert.deepEqual(validateSite(site), site);
  assert.throws(() => makeSiteFromBrief({ ...brief, mode: 'website', plannerProfile: 'collection' }), /App-Profil/);
  assert.throws(() => makeSiteFromBrief({ ...brief, mode: 'app', plannerProfile: 'random' }), /App-Profil/);
  assert.throws(() => validateSite({
    ...site, plannerFields: [{ id: 'category', label: 'Kategorie', type: 'text' }],
  }), /bereits/);
});

test('old backups stay readable in the planner and collection backups remain isolated by profile', () => {
  const project = 'mein-projekt';
  const original = exportPlanner(project, [entry]);
  assert.equal(Object.hasOwn(JSON.parse(original), 'profile'), false);
  assert.deepEqual(importPlanner(original, project), [entry]);
  const book = { ...entry, values: { category: 'Sachbuch', note: 'Für später' } };
  const backup = exportPlanner(project, [book], 'collection');
  assert.deepEqual(importPlanner(backup, project, 'collection'), [book]);
  assert.throws(() => importPlanner(backup, 'fremd', 'collection'), /anderen Projekt/);
  assert.throws(() => importPlanner(backup, project), /anderen App-Profil/);
  assert.throws(() => importPlanner(original, project, 'collection'), /anderen App-Profil/);
  assert.notEqual(plannerKey(project, '/', 'collection'), plannerKey(project, '/'));
});
