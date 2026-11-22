import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {curriculum,places,wallet} from '../woerterwelt/lernen.js';
test('Jede Inselaufgabe hat hörbare Laute, eine Lösung und ein alternatives Feld',async()=>{
 const clips=JSON.parse(await readFile(new URL('../woerterwelt/stimme.json',import.meta.url)));
 for(const place of places){
  const history=[];
  for(let i=0;i<24;i++){
   const q=curriculum(place.id,history)[0];
   assert.ok(clips[q.sound]);assert.ok(q.options.includes(q.target));assert.equal(new Set(q.options).size,2);
   history.push({id:String(i),place:place.id,kind:q.kind,target:q.target,helped:false,at:Date.now()});
  }
 }
});
test('Hilfe und Ausgaben kosten kein Level, wiederholte Ereignisse bringen keine zweite Münze',()=>{
 const events=Array.from({length:30},(_,id)=>({id,helped:true}));
 assert.deepEqual(wallet([...events,events[0]]),{earned:30,level:4,next:10});
});
