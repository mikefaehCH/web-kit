import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { prepareMessage, sendPreparedBatch } from '../supabase/functions/web-kit-whatsapp-send/bound-send.mjs';

test('der reservierte Hash und der tatsächlich versendete Text stimmen überein', async () => {
  let count=0, observed;
  const store={async claimNext({messageHash}) { assert.equal(messageHash,createHash('sha256').update('Hallo').digest('hex')); return count++ ? null : {id:'i',requestKey:'key',chatId:'41790000000@c.us'}; },async finish(){return true;}};
  const result=await sendPreparedBatch({store,batchId:'b',actorId:'a',message:'  Hallo  ',send:async input=>{observed=input;return {status:'accepted',providerId:'fake'};}});
  assert.equal(observed.message,'Hallo'); assert.equal(result.stopped,false);
});
test('abweichende Nachricht wird vor dem Provideraufruf gestoppt', async () => {
  let sent=0; const expected=(await prepareMessage('Original')).messageHash;
  const store={async claimNext({messageHash}) { if(messageHash!==expected)throw Error('mismatch'); },async finish(){throw Error('not called');}};
  await assert.rejects(sendPreparedBatch({store,batchId:'b',actorId:'a',message:'Geändert',send:async()=>{sent++;}}));
  assert.equal(sent,0);
});
test('ungültige Nachricht wird vor Claim und Versand abgewiesen', async () => {
  let called=0; const store={async claimNext(){called++;},async finish(){called++;}};
  for (const message of ['', '  ', 'x'.repeat(4001), null]) await assert.rejects(sendPreparedBatch({store,batchId:'b',actorId:'a',message,send:async()=>{called++;}}));
  assert.equal(called,0);
});
