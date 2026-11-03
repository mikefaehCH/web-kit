import { test } from 'node:test';
import assert from 'node:assert/strict';
import '../modules/reisekasse.js';
import { makeLedgerBackup, parseLedgerBackup } from '../modules/private-ledger-backup.js';
const L=globalThis.WebKitLedger;
const trip={title:'Fixture',people:['A','B']};
const entry={id:'e1',description:'Train',cents:101,currency:'EUR',payer:'A',members:['A','B']};
test('backup roundtrip preserves validated expenses and exchange settings', () => {
  const json=makeLedgerBackup(trip,[entry,{id:'settings',kind:'settings',chf_per_eur:0.94}],L);
  const restored=parseLedgerBackup(json,L);
  assert.equal(restored.entries[0].cents,101); assert.equal(restored.entries[1].chf_per_eur,0.94);
  assert.deepEqual(restored.people,trip.people); assert.ok(!json.includes('owner_id'));
});
test('rejects invalid JSON, duplicates, outsiders, unsafe names and oversized backups', () => {
  const base={format:'web-kit-private-ledger',version:1,...trip,entries:[entry]};
  for (const value of ['no json', JSON.stringify({...base,entries:[entry,entry]}),JSON.stringify({...base,entries:[{...entry,payer:'X'}]}),JSON.stringify({...base,people:['__proto__']}),' '.repeat(2*1024*1024+1)])
    assert.throws(()=>parseLedgerBackup(value,L), TypeError);
});
