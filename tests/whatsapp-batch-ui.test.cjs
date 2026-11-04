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
function setup(enabled, history=[], failInspect=false, contacts=[{id:'41790000000@c.us',name:'Test'}]){
  const nodes=new Map(), actions=[];
  const document={getElementById(id){if(!nodes.has(id))nodes.set(id,new Element());return nodes.get(id);},createElement(){return new Element();},createTextNode(text){return {text};}};
  const events={};
  const window={addEventListener:(name,fn)=>{events[name]=fn;},WEB_KIT_WHATSAPP_BATCH_UI_ENABLED:enabled,WEB_KIT_GET_ACCESS_TOKEN:async()=>'fake',WEB_KIT_WHATSAPP_ENDPOINT:'https://example.invalid',confirm:()=>true};
  const fetch=async(_url,init)=>{const req=JSON.parse(init.body);actions.push(req);let data={};
    if(req.action==='batch_list')data={batches:req.before ? history.slice(20) : history.slice(0,20)};
    if(req.action==='list_contacts')data={contacts};
    if(req.action==='batch_create')data={ok:true};
    if(req.action==='batch_send')data={stopped:false};
    if(req.action==='batch_inspect')data={items:[{id:'i',chatId:'41790000000@c.us',status:'accepted',reviewAvailable:false}]};
    return {ok:!(failInspect && req.action==='batch_inspect'),json:async()=>data};};
  vm.runInNewContext(fs.readFileSync('admin/batch-ui.js','utf8'),{window,document,fetch,crypto:{randomUUID:()=> 'aaaaaaaa-1111-4111-8111-111111111111'}});
  return {nodes,actions,document,events,window};
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

test('older history can be opened without sending a message',async()=>{
  const history=Array.from({length:21},(_,i)=>({id:'batch-'+i,createdAt:'date-'+i}));
  const t=setup(true,history),el=id=>t.document.getElementById(id);
  await el('batch-load-jobs').fire('click');
  assert.equal(el('batch-jobs').children.length,21);
  await el('batch-jobs').children[20].fire('click');
  assert.equal(t.actions[1].before,'batch-19');
  assert.equal(el('batch-jobs').children.length,1);
  await el('batch-jobs').children[0].children[0].fire('click');
  assert.equal(t.actions[2].action,'batch_inspect');assert.equal(t.actions[2].batchId,'batch-20');
  assert.ok(!t.actions.some(a=>a.action==='batch_send'));
});

test('failed status lookup cannot authorise resumption of that batch',async()=>{
  const t=setup(true,[{id:'batch-1',createdAt:'date'}],true),el=id=>t.document.getElementById(id);
  await el('batch-load-jobs').fire('click');
  await el('batch-jobs').children[0].children[0].fire('click');
  el('batch-message').value='Hallo';el('batch-review-button').fire('click');
  assert.equal(el('batch-review').hidden,true);
  await el('batch-confirm').fire('click');
  assert.ok(!t.actions.some(a=>a.action==='batch_send'));
});

test('authentication refresh clears selected contacts and message before another session',async()=>{
  const t=setup(true),el=id=>t.document.getElementById(id);
  await el('batch-load-contacts').fire('click');
  const check=el('batch-contacts').children[0].children[0].children[0];check.checked=true;check.fire('change');
  el('batch-message').value='Private Nachricht';el('batch-review-button').fire('click');
  assert.equal(el('batch-review').hidden,false);
  t.events['web-kit-admin-authenticated']();
  assert.equal(el('batch-message').value,'');assert.equal(el('batch-review').hidden,true);assert.equal(el('batch-contacts').children.length,0);
  await el('batch-confirm').fire('click');assert.ok(!t.actions.some(a=>a.action==='batch_send'));
});

test('logout while obtaining a token prevents the pending network request',async()=>{
  const t=setup(true), el=id=>t.document.getElementById(id);
  await el('batch-load-contacts').fire('click');
  const check=el('batch-contacts').children[0].children[0].children[0];check.checked=true;check.fire('change');
  el('batch-message').value='Hallo';el('batch-review-button').fire('click');
  let release; t.window.WEB_KIT_GET_ACCESS_TOKEN=()=>new Promise(resolve=>{release=resolve;});
  const pending=el('batch-confirm').fire('click');
  el('logout').fire('click');release('fake');await pending;
  assert.deepEqual(t.actions.map(a=>a.action),['list_contacts']);
});

test('search filters contacts while retaining selections for preview',async()=>{
  const contacts=[{id:'41790000000@c.us',name:'Anna'},{id:'120363123456789000@g.us',name:'Familie'}];
  const t=setup(true,[],false,contacts),el=id=>t.document.getElementById(id);
  await el('batch-load-contacts').fire('click');
  const rows=el('batch-contacts').children, check=rows[0].children[0].children[0];
  check.checked=true;check.fire('change');
  el('batch-contacts-search').value='familie';el('batch-contacts-search').fire('input');
  assert.equal(rows[0].hidden,true);assert.equal(rows[1].hidden,false);
  el('batch-message').value='Hallo';el('batch-review-button').fire('click');
  assert.equal(el('batch-preview-recipients').children[0].textContent,'Anna · 41790000000@c.us');
  el('logout').fire('click');assert.equal(el('batch-contacts-search').value,'');
});
