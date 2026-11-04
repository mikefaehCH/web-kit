import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runBatch } from '../supabase/functions/web-kit-whatsapp-send/batch.mjs';

function memoryStore() {
  const items = ['a','b'].map(id => ({ id, requestKey: `key-${id}`, status: 'queued' }));
  return { items, async claimNext({actorId}) { if (actorId !== 'owner') throw Error('forbidden'); if (items.some(x => x.status === 'pending' || x.status === 'unknown')) return {blocked:true}; const item = items.find(x => x.status === 'queued'); if (!item) return null; item.status = 'pending'; return { ...item }; }, async finish({itemId, outcome}) { const item = items.find(x => x.id === itemId); if (item.status !== 'pending') return false; item.status = outcome.status; return true; } };
}
const input = store => ({ store, batchId:'batch', actorId:'owner', messageHash:'a'.repeat(64) });
test('two workers cannot dispatch the same batch concurrently', async () => {
  const store=memoryStore(), sent=[];
  const send=async x => { sent.push(x.id); await new Promise(r => setTimeout(r, 1)); return {status:'accepted'}; };
  await Promise.all([runBatch({...input(store),send}),runBatch({...input(store),send})]);
  assert.deepEqual(sent.sort(), ['a','b']);
  assert.deepEqual(store.items.map(x=>x.status), ['accepted','accepted']);
});
test('ambiguous response stops; pending and unknown are never automatically reclaimed', async () => {
  const store=memoryStore(), sent=[];
  const first=await runBatch({...input(store),send:async x=>{sent.push(x.id); throw Error('timeout');}});
  assert.equal(first.reason,'unknown');
  assert.deepEqual(store.items.map(x=>x.status), ['unknown','queued']);
  // Recovery requires explicit resolution, never a retry of unknown.
  const resumed=await runBatch({...input(store),send:async x=>{sent.push(x.id); return {status:'accepted'};}});
  assert.equal(resumed.reason,'blocked');
  assert.deepEqual(sent,['a']);
});
test('audit failure stops processing and leaves the claim pending', async () => {
  const store=memoryStore(), sent=[]; store.finish=async()=>false;
  const result=await runBatch({...input(store),send:async x=>{sent.push(x.id);return {status:'accepted'};}});
  assert.equal(result.reason,'unrecorded');
  assert.deepEqual(store.items.map(x=>x.status),['pending','queued']);
  assert.deepEqual(sent,['a']);
});
test('wrong owner cannot trigger provider', async () => {
  const store=memoryStore(); let sent=false;
  await assert.rejects(runBatch({store,batchId:'batch',actorId:'other',messageHash:'a'.repeat(64),send:async()=>{sent=true;}}));
  assert.equal(sent,false);
});

test('Rate-Limit stoppt den Lauf ohne Provideraufruf', async () => {
  let sent=0; const store={claimNext:async()=>({blocked:true,reason:'rate_limited'}),finish:async()=>{throw Error('not called');}};
  const result=await runBatch({...input(store),send:async()=>{sent++;}});
  assert.equal(result.reason,'rate_limited'); assert.equal(sent,0);
});
