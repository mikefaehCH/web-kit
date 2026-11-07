import assert from 'node:assert/strict';
import test from 'node:test';
import { briefFromSentence } from '../admin/quick-brief.js';
import { makeSiteFromBrief } from '../admin/site-schema.js';

test('one sentence produces an editable canonical draft across all three modes', () => {
  const from = (sentence) => makeSiteFromBrief(briefFromSentence(sentence));
  const site = from('Ich möchte eine Website für meinen Verein.');
  assert.equal(site.mode ?? 'website', 'website');
  assert.equal(site.content.sections[1].heading, 'Angebot');
  const app = from('Ich will unsere Brettspiele sammeln und wiederfinden.');
  assert.equal(app.mode, 'app');
  assert.equal(app.plannerProfile, 'collection');
  const hybrid = from('Eine Website mit App für unsere Aufgaben.');
  assert.equal(hybrid.mode, 'hybrid');
  assert.throws(() => from('  '), /Beschreibe/);
});
