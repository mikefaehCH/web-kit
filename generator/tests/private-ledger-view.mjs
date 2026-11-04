// Synthetic UI tests for the private ledger view: no network, no real data.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mountPrivateLedger } from '../modules/private-ledger-view.js';

// Minimal DOM: only what the view uses.
class Node {
  constructor(tag) { this.tagName = tag.toUpperCase(); this.children = []; this.attrs = {}; this.listeners = {}; this._text = ''; this.disabled = false; this.checked = false; this.value = ''; this.parent = null; }
  get textContent() { return this._text + this.children.map(c => c.textContent).join(''); }
  set textContent(v) { this._text = String(v); this.children = []; }
  append(...nodes) { for (const n of nodes) { n.parent = this; this.children.push(n); } }
  replaceChildren(...nodes) { this.children = []; this._text = ''; this.append(...nodes); }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }
  removeAttribute(k) { delete this.attrs[k]; }
  addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
  dispatch(type) { const e = { type, preventDefault() {} }; for (const fn of this.listeners[type] || []) fn(e); }
  click() { this.dispatch('click'); }
  *walk() { for (const c of this.children) { yield c; yield* c.walk(); } }
  querySelectorAll(selector) {
    const parts = selector.split(',').map(s => s.trim().toLowerCase());
    return [...this.walk()].filter(n => parts.some(p => {
      const [tag, pseudo] = p.split(':');
      return n.tagName.toLowerCase() === tag && (pseudo !== 'checked' || n.checked);
    }));
  }
  find(tag, text) { return [...this.walk()].find(n => n.tagName === tag.toUpperCase() && (text === undefined || n.textContent.includes(text))); }
}
globalThis.document = { createElement: tag => new Node(tag) };

const flush = () => new Promise(resolve => setImmediate(resolve));
function deferred() { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; }

const people = ['Ana', 'Ben'];
const trips = [{ id: 'trip-a', title: 'Reise A', people }, { id: 'trip-b', title: 'Reise B', people }];
const ledger = {
  normalize: payload => payload, format: cents => (cents / 100).toFixed(2), parseAmount: v => Math.round(Number(v) * 100) || 0,
  validRate: v => v > 0.1 && v < 10,
  summarize: (rows, ps) => ({ total: rows.reduce((s, r) => s + (r.cents || 0), 0), missingRate: 0, net: Object.fromEntries(ps.map(p => [p, 0])) }),
};
const backup = { makeLedgerBackup: () => '{}' };

function fakeStore() {
  const pending = [];
  const calls = { listTrips: 0, snapshots: [], createTrip: 0, addEntry: 0 };
  const store = {
    listTrips() { calls.listTrips++; return Promise.resolve(trips); },
    getTripSnapshot(id) { calls.snapshots.push(id); const d = deferred(); pending.push({ id, d }); return d.promise; },
    createTrip() { calls.createTrip++; return Promise.resolve({ id: 'trip-c' }); },
    addEntry() { calls.addEntry++; return Promise.resolve({}); },
    updateEntry() { return Promise.resolve({}); },
  };
  const answer = id => {
    const i = pending.findIndex(p => p.id === id); const [{ d }] = pending.splice(i, 1);
    d.resolve({ trip: trips.find(t => t.id === id), entries: [{ entry_id: 'e1', version: 1, payload: { id: 'e1', kind: 'expense', description: 'Ausgabe ' + id, cents: 1000, currency: 'CHF' } }] });
  };
  return { store, calls, answer };
}

async function mounted() {
  const root = new Node('div'); const s = fakeStore();
  const dispose = mountPrivateLedger(root, { store: s.store, ledger, backup });
  await flush();
  const select = root.find('select');
  return { root, select, dispose, ...s };
}

test('Aktionen während eines Ladevorgangs werden gesperrt und danach wieder freigegeben', async () => {
  const { root, select, calls, answer } = await mounted();
  select.value = 'trip-a'; select.dispatch('change'); await flush();
  assert.equal(root.getAttribute('aria-busy'), 'true');
  assert.ok(root.querySelectorAll('button,input,select').every(c => c.disabled), 'Bedienelemente während des Ladens gesperrt');

  select.value = 'trip-b'; select.dispatch('change');
  root.find('form').dispatch('submit');
  await flush();
  assert.deepEqual(calls.snapshots, ['trip-a'], 'kein zweiter Ladevorgang');
  assert.equal(calls.createTrip, 0, 'keine Reise während des Ladens erstellt');
  assert.equal(select.value, '', 'Auswahl springt auf den bestätigten Stand zurück');

  answer('trip-a'); await flush();
  assert.equal(root.getAttribute('aria-busy'), 'false');
  assert.ok(root.querySelectorAll('button,input,select').every(c => !c.disabled));
  assert.equal(select.value, 'trip-a');
  assert.ok(root.find('h3', 'Reise A'));
});

test('Doppeltes Absenden einer Ausgabe erzeugt nur einen Eintrag', async () => {
  const { root, select, calls, answer } = await mounted();
  select.value = 'trip-a'; select.dispatch('change'); await flush(); answer('trip-a'); await flush();
  const form = root.find('button', 'Ausgabe hinzufügen').parent;
  form.find('input').value = 'Brot'; form.querySelectorAll('input')[1].value = '12.5';
  form.dispatch('submit'); form.dispatch('submit'); await flush();
  assert.equal(calls.addEntry, 1);
  answer('trip-a'); await flush();
  assert.equal(root.getAttribute('aria-busy'), 'false');
});

test('Verspätete Antwort nach Abmeldung wird verworfen', async () => {
  const { root, select, dispose, answer } = await mounted();
  select.value = 'trip-b'; select.dispatch('change'); await flush();
  dispose();
  answer('trip-b'); await flush();
  assert.equal(root.children.length, 0, 'nach Abmeldung nichts gerendert');
  assert.equal(root.getAttribute('aria-busy'), null);
});

test('Snapshot einer anderen Reise wird nicht angezeigt', async () => {
  const root = new Node('div'); const s = fakeStore();
  s.store.getTripSnapshot = async () => ({ trip: trips[1], entries: [] });
  mountPrivateLedger(root, { store: s.store, ledger, backup }); await flush();
  const select = root.find('select'); select.value = 'trip-a'; select.dispatch('change'); await flush(); await flush();
  assert.match(root.find('p').textContent, /nicht eindeutig/);
  assert.equal(root.find('h3'), undefined, 'keine fremde Reise gerendert');
});
