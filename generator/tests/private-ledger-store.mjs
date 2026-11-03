import { test } from 'node:test';
import assert from 'node:assert/strict';
import '../modules/reisekasse.js';
import { createPrivateLedgerStore } from '../modules/private-ledger-store.js';

function fixture(user = { id: 'owner' }) {
  const requests = [];
  const client = { auth: { getUser: async () => ({ data: { user }, error: null }) }, from(table) {
    const request = { table, filters: [] }; requests.push(request);
    const q = { select(s) { request.select = s; return q; }, eq(k,v) { request.filters.push([k,v]); return q; }, order() { return q; }, insert(v) { request.insert = v; return q; }, single() { return q; }, then(resolve) { resolve({ data: request.insert || [], error: null }); } };
    return q;
  } };
  return { store: createPrivateLedgerStore(client, globalThis.WebKitLedger), requests };
}

test('reads only isolated owner and trip tables', async () => {
  const {store, requests} = fixture();
  await store.listTrips(); await store.listEntries('trip-a');
  assert.deepEqual(requests.map(r => r.table), ['web_kit_private_trips','web_kit_private_entries']);
  assert.deepEqual(requests[1].filters, [['owner_id','owner'],['trip_id','trip-a']]);
});
test('validates participants and normalizes entries before inserting', async () => {
  const {store, requests} = fixture();
  await assert.rejects(store.createTrip('Test', ['A','A']), TypeError);
  await assert.rejects(store.addEntry('trip-a', {id:'x',description:'bad',cents:100,currency:'CHF',payer:'B',members:['A']}, ['A']), TypeError);
  assert.equal(requests.length, 0);
  const row = await store.addEntry('trip-a', {id:'x',description:'Test',cents:100,currency:'CHF',payer:'A',members:['A']}, ['A']);
  assert.equal(row.owner_id, 'owner'); assert.equal(row.payload.id, row.entry_id);
});
test('rejects absent and anonymous users before querying', async () => {
  for (const user of [null, {id:'owner',is_anonymous:true}]) {
    const {store,requests} = fixture(user);
    await assert.rejects(store.listTrips(), /sign-in/); assert.equal(requests.length, 0);
  }
});
