// Unit-Tests der Reisekassen-Rechenlogik (js/ledger.js). Nur synthetische Daten.
import assert from 'node:assert/strict';
import '../modules/reisekasse.js';
const L = globalThis.WebKitLedger;
const P = ['PersonA', 'PersonB', 'PersonC', 'PersonD'];
const n = (x) => L.normalize(x, P);

// v1-Einträge bleiben lesbar
const v1 = n({ id: 'a', description: 'Hotel', cents: 50900, currency: 'CHF', payer: 'PersonA', members: P });
assert.equal(v1.kind, 'expense');
assert.equal(v1.category, 'sonstiges');
assert.equal(v1.status, 'bezahlt');
assert.equal(n({ id: 's', kind: 'settlement', from: 'PersonB', to: 'PersonA', cents: 100, currency: 'EUR' }).kind, 'settlement');

// Ungültiges wird verworfen
assert.equal(n({ id: 'x', description: '', cents: 100, currency: 'EUR', payer: 'PersonA', members: P }), null);
assert.equal(n({ id: 'x', description: 'A', cents: -1, currency: 'EUR', payer: 'PersonA', members: P }), null);
assert.equal(n({ id: 'x', description: 'A', cents: 100, currency: 'USD', payer: 'PersonA', members: P }), null);
assert.equal(n({ id: 'x', description: 'A', cents: 100, currency: 'EUR', payer: 'Fremd', members: P }), null);
assert.equal(n({ id: 'x', description: 'A', cents: 100, currency: 'EUR', payer: 'PersonA', members: ['PersonA', 'PersonA'] }), null);
assert.equal(n({ id: 'x', kind: 'settlement', from: 'PersonA', to: 'PersonA', cents: 100, currency: 'EUR' }), null);
assert.equal(n({ id: 'x', kind: 'settings', chf_per_eur: 0 }), null);

// Offene Posten ohne Betrag sind erlaubt und zählen nicht
const open = n({ id: 'o', description: 'Flüge', cents: null, status: 'offen', payer: 'PersonA', members: P });
assert.ok(open);
assert.equal(open.cents, null);

// Rotierende Restrappen: Summe stimmt, nicht immer dieselbe Person
for (const id of ['a', 'b', 'c', 'd', 'e']) {
  const s = L.split(101, P, id);
  assert.equal(Object.values(s).reduce((a, b) => a + b, 0), 101);
}
const firsts = new Set(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((id) => Object.entries(L.split(101, P, id)).find(([, c]) => c === 26)[0]));
assert.ok(firsts.size > 1, 'Restrappen müssen rotieren');

// Mischwährung → ein CHF-Ausgleich; Kurs pro Eintrag hat Vorrang
const rate = 0.94;
const entries = [
  v1,
  n({ id: 'b', description: 'Abendessen', category: 'essen', cents: 8400, currency: 'EUR', payer: 'PersonB', members: P }),
  n({ id: 'c', description: 'Austern', category: 'essen', cents: 4600, currency: 'EUR', rate_used: 0.94, payer: 'PersonC', members: P }),
  n({ id: 'd', description: 'Proviant', category: 'essen', cents: 2340, currency: 'EUR', payer: 'PersonD', members: P }),
  open,
];
const s = L.summarize(entries, P, rate);
assert.equal(s.total, 50900 + 7896 + 4324 + 2200);
assert.equal(Object.values(s.net).reduce((a, b) => a + b, 0), 0, 'Salden müssen sich aufheben');
assert.equal(s.missingRate, 0);
assert.equal(s.share.PersonA + s.share.PersonB + s.share.PersonC + s.share.PersonD, s.total);
assert.equal(s.transfers.every((t) => t.to === 'PersonA'), true);
assert.equal(s.transfers.reduce((a, t) => a + t.cents, 0), s.net.PersonA);
assert.equal(s.byCategory.PersonA.unterkunft === undefined, true);
assert.equal(s.byCategory.PersonA.sonstiges, 12725);

// Ohne Reisekurs werden EUR-Einträge gemeldet, nicht still mit 1:1 gerechnet
const noRate = L.summarize(entries, P, null);
assert.equal(noRate.missingRate, 2);

// Rückzahlung gleicht aus
const settled = entries.concat(s.transfers.map((t, i) => n({ id: 't' + i, kind: 'settlement', from: t.from, to: t.to, cents: t.cents, currency: 'CHF' })));
const after = L.summarize(settled, P, rate);
assert.deepEqual(Object.values(after.net), [0, 0, 0, 0]);
assert.equal(after.transfers.length, 0);

// Soft-Delete zählt nicht
const deleted = L.summarize([{ ...v1, deleted_at: '2026-10-31T00:00:00Z' }], P, rate);
assert.equal(deleted.total, 0);

// Betragseingabe
assert.equal(L.parseAmount('42,80'), 4280);
assert.equal(L.parseAmount('42.8'), 4280);
assert.equal(L.parseAmount("1'250.50"), 125050);
assert.equal(L.parseAmount('0'), null);
assert.equal(L.parseAmount('abc'), null);
assert.equal(L.parseAmount('1.234'), null);
assert.equal(L.format(125050), '1’250.50');
assert.equal(L.format(-8434), '−84.34');

// Vorgemerkt: gebucht, aber noch nicht belastet → nicht im Ausgleich, separat ausgewiesen
const hotel = n({ id: 'h1', description: 'Parador', category: 'unterkunft', cents: 20000, currency: 'CHF', status: 'vorgemerkt', charge_on: '2027-05-01', payer: 'PersonA', members: P });
assert.equal(hotel.status, 'vorgemerkt');
assert.equal(hotel.charge_on, '2027-05-01');
assert.equal(n({ id: 'x', kind: 'settlement', status: 'vorgemerkt', from: 'PersonB', to: 'PersonA', cents: 1, currency: 'CHF' }), null);
const withPlan = L.summarize([v1, hotel], P, rate);
assert.equal(withPlan.total, 50900);
assert.equal(withPlan.planned, 20000);
assert.equal(withPlan.net.PersonA, 50900 - 12725);
assert.equal(withPlan.plannedShare.PersonA, 5000);
assert.equal(withPlan.plannedByCategory.PersonB.unterkunft, 5000);
const charged = L.summarize([v1, { ...hotel, status: 'bezahlt' }], P, rate);
assert.equal(charged.total, 70900);
assert.equal(charged.planned, 0);

console.log('PASS: Reisekasse-Rechenlogik (v1/v2, Mischwährung, rotierende Rappen, Ausgleich, offene Posten, vorgemerkte Posten, Soft-Delete)');
