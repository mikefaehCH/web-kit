import { test } from 'node:test';
import assert from 'node:assert/strict';
import '../modules/reisekasse.js';
import { createPrivateLedgerStore } from '../modules/private-ledger-store.js';

function fixture(user = { id: 'owner' }) {
  const requests = [];
  const client = { auth: { getUser: async () => ({ data: { user }, error: null }) }, rpc(name,args) { requests.push({rpc:name,args}); return Promise.resolve({data:{trip:{id:args.p_trip_id,people:['A']},entries:[]},error:null}); }, from(table) {
    const request = { table, filters: [] }; requests.push(request);
    const q = { select(s) { request.select = s; return q; }, eq(k,v) { request.filters.push([k,v]); return q; }, order() { return q; }, range() { return q; }, insert(v) { request.insert = v; return q; }, update(v) { request.update = v; return q; }, single() { return q; }, then(resolve) { resolve({ data: request.insert || [], count: 0, error: null }); } };
    return q;
  } };
  return { store: createPrivateLedgerStore(client, globalThis.WebKitLedger), requests };
}

test('reads only isolated owner and trip tables', async () => {
  const {store, requests} = fixture();
  await store.listTrips(); await store.getTripSnapshot('trip-a');
  assert.equal(requests[0].table, 'web_kit_private_trips');
  assert.deepEqual(requests[1], {rpc:'web_kit_private_ledger_snapshot',args:{p_trip_id:'trip-a'}});
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

test('stale edit reports a conflict and is scoped to owner, trip, entry and version', async () => {
  const {store, requests} = fixture();
  const entry = {id:'x',description:'Test',cents:100,currency:'CHF',payer:'A',members:['A']};
  await assert.rejects(store.updateEntry('trip-a', entry, ['A'], 1), /zwischenzeitlich/);
  assert.deepEqual(requests[0].filters, [['owner_id','owner'],['trip_id','trip-a'],['entry_id','x'],['version',1]]);
  await assert.rejects(store.updateEntry('trip-a', entry, ['A'], 0), TypeError);
});

test('trip updates retain existing participants and use version checks', async () => {
  const {store, requests} = fixture();
  const trip = {id:'trip-a',people:['A','B'],version:1};
  await assert.rejects(store.updateTrip(trip, 'Test', ['A']), TypeError);
  await assert.rejects(store.createTrip('Test', ['__proto__']), TypeError);
  assert.equal(requests.length, 0);
  await assert.rejects(store.updateTrip(trip, 'Updated', ['A','B','C']), /zwischenzeitlich/);
  assert.deepEqual(requests[0].filters, [['owner_id','owner'],['id','trip-a'],['version',1]]);
});

test('loads every page even with a smaller server cap and rejects changing totals', async () => {
  const items=Array.from({length:475},(_,i)=>({entry_id:String(i).padStart(4,'0')}));
  let inconsistent=false, calls=0;
  const client={auth:{getUser:async()=>({data:{user:{id:'owner'}}})},from(){
    let start=0;
    const q={select(){return q},eq(){return q},order(){return q},range(a){start=a;return q},then(resolve){calls++; resolve({data:items.slice(start,start+73),count:inconsistent&&calls>1?474:475,error:null})}};
    return q;
  }};
  const store=createPrivateLedgerStore(client,globalThis.WebKitLedger);
  assert.equal((await store.listTrips()).length,475);
  inconsistent=true;calls=0;
  await assert.rejects(store.listTrips(),/erneut laden/);
});
