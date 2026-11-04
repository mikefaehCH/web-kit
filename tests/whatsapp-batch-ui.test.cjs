const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
class Element {
  constructor(){this.handlers={};this.children=[];this.value='';this.hidden=true;this.checked=false;this.textContent='';}
  addEventListener(type,fn){this.handlers[type]=fn;}
  fire(type){return this.handlers[type]?.({preventDefault(){}});}
  append(...nodes){this.children.push(...nodes);}
  replaceChildren(...nodes){this.children=nodes;}
  setAttribute(){} removeAttribute(){}
}
function setup(enabled){
  const nodes=new Map(), actions=[];
  const document={getElementById(id){if(!nodes.has(id))nodes.set(id,new Element());return nodes.get(id);},createElement(){return new Element();},createTextNode(text){return {text};}};
  const window={WEB_KIT_WHATSAPP_BATCH_UI_ENABLED:enabled,WEB_KIT_GET_ACCESS_TOKEN:async()=>'fake',WEB_KIT_WHATSAPP_ENDPOINT:'https://example.invalid',confirm:()=>true};
  const fetch=async(_url,init)=>{const req=JSON.parse(init.body);actions.push(req);let data={};
    if(req.action==='list_contacts')data={contacts:[{id:'41790000000@c.us',name:'Test'}]};
    if(req.action==='batch_create')data={ok:true};
    if(req.action==='batch_send')data={stopped:false};
    if(req.action==='batch_inspect')data={items:[{id:'i',chatId:'41790000000@c.us',status:'accepted',reviewAvailable:false}]};
    return {ok:true,json:async()=>data};};
  vm.runInNewContext(fs.readFileSync('admin/batch-ui.js','utf8'),{window,document,fetch,crypto:{randomUUID:()=> 'aaaaaaaa-1111-4111-8111-111111111111'}});
  return {nodes,actions,document};
}
test('feature stays hidden by default',()=>{const t=setup(false);assert.equal(t.document.getElementById('batch-ui').hidden,true);assert.equal(t.actions.length,0);});
test('preview required before creation and one simulated send',async()=>{
  const t=setup(true), el=id=>t.document.getElementById(id);
  await el('batch-load-contacts').fire('click');
  const check=el('batch-contacts').children[0].children[0].children[0];check.checked=true;check.fire('change');
  el('batch-message').value=' Hallo ';el('batch-message').fire('input');
  await el('batch-confirm').fire('click');assert.deepEqual(t.actions.map(x=>x.action),['list_contacts']);
  el('batch-review-button').fire('click');assert.equal(el('batch-review').hidden,false);assert.equal(el('batch-preview').textContent,'Hallo');
  await el('batch-confirm').fire('click');
  assert.deepEqual(t.actions.map(x=>x.action),['list_contacts','batch_create','batch_send','batch_inspect']);
  assert.equal(t.actions[1].message,'Hallo');assert.equal(t.actions[2].message,'Hallo');assert.equal(el('batch-review').hidden,true);
  el('logout').fire('click');assert.equal(el('batch-message').value,'');assert.equal(el('batch-results').children.length,0);
});
