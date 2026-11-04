import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBatchStore } from '../supabase/functions/web-kit-whatsapp-send/batch-store.mjs';
const args={batchId:'batch',actorId:'owner',messageHash:'a'.repeat(64)};
test('claim translates complete, blocked and claimed states', async()=>{
  for (const [data, expected] of [[{state:'complete'},null],[{state:'blocked'},{blocked:true}],[{state:'claimed',item_id:'item',request_key:'key',chat_id:'contact'},{id:'item',requestKey:'key',chatId:'contact'}]]) {
    let call; const store=createBatchStore(async(name, params)=>{call={name,params};return {data,error:null};});
    assert.deepEqual(await store.claimNext(args),expected);
    assert.deepEqual(call,{name:'web_kit_whatsapp_batch_claim',params:{p_batch:'batch',p_actor:'owner',p_message_hash:'a'.repeat(64)}});
  }
});
test('database error and malformed claim fail closed without leaking details',async()=>{
  for(const result of [{error:'secret'}, {data:null}, {data:{state:'claimed',item_id:'item'}}]) {
    await assert.rejects(createBatchStore(async()=>result).claimNext(args), e=>!e.message.includes('secret'));
  }
});
test('accepted outcome requires a valid provider reference',async()=>{
  let calls=0; const store=createBatchStore(async()=>{calls++; return {data:true};});
  for(const providerId of [undefined,'<invalid>', '']) await assert.rejects(store.finish({...args,itemId:'item',requestKey:'key',outcome:{status:'accepted',providerId}}));
  assert.equal(calls,0);
  assert.equal(await store.finish({...args,itemId:'item',requestKey:'key',outcome:{status:'accepted',providerId:'ABC123'}}),true);
});
test('non-true completion does not report success',async()=>{
  const store=createBatchStore(async()=>({data:null}));
  assert.equal(await store.finish({...args,itemId:'item',requestKey:'key',outcome:{status:'unknown'}}),false);
});

test('Statusabfrage gibt nur Empfänger und verständlichen Status zurück',async()=>{
  let seen; const store=createBatchStore(async(name,params)=>{seen={name,params};return {data:{items:[{item_id:'item',chat_id:'41790000000@c.us',status:'accepted',review_available:false,provider_id:'ignored'}]}};});
  assert.deepEqual(await store.inspect(args),[{id:'item',chatId:'41790000000@c.us',status:'accepted',reviewAvailable:false}]);
  assert.deepEqual(seen,{name:'web_kit_whatsapp_batch_inspect',params:{p_batch:'batch',p_actor:'owner'}});
});
test('defekte oder unbekannte Statusantwort wird abgewiesen',async()=>{
  for (const items of [null,[{item_id:'a',chat_id:'b',status:'delivered'}],Array(11).fill({item_id:'a',chat_id:'b',status:'queued'})]) {
    await assert.rejects(createBatchStore(async()=>({data:{items}})).inspect(args));
  }
});

test('manuell geprüfter unklarer Status bleibt sichtbar',async()=>{
  const store=createBatchStore(async()=>({data:{items:[{item_id:'i',chat_id:'41790000000@c.us',status:'reviewed',review_available:false}]}}));
  assert.equal((await store.inspect(args))[0].status,'reviewed');
});

test('Statusklärung erfordert ausdrückliche Bestätigung',async()=>{
  let calls=0;const store=createBatchStore(async(name,params)=>{calls++;assert.equal(name,'web_kit_whatsapp_batch_resolve');assert.equal(params.p_confirm,true);return {data:true};});
  for (const confirmed of [false,null,undefined,'true']) await assert.rejects(store.resolve({...args,itemId:'i',confirmed}));
  assert.equal(calls,0);assert.equal(await store.resolve({...args,itemId:'i',confirmed:true}),true);assert.equal(calls,1);
});
