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
