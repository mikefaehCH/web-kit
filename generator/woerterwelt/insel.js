import {places,pets,words,curriculum,wallet} from './lernen.js';
const world=document.querySelector('#world'),player=new Audio();
let voice={},muted=false,narration=['start'],epoch=0,round,view='home',owner='guest',cloud,account,issue='';
const legacy=k=>JSON.parse(localStorage.getItem('woerterwelt.v1.'+k)||'null');
const invited=new URLSearchParams(location.hash.slice(1)).get('vorname');
if(invited&&/^\p{L}[\p{L} -]{0,17}$/u.test(invited)){localStorage.setItem('woerterwelt.v1.name',JSON.stringify(invited));history.replaceState(null,'',location.pathname);}
function key(k){return 'insel.v2.'+owner+'.'+k;}
function read(k, fallback){return JSON.parse(localStorage.getItem(key(k))||JSON.stringify(fallback));}
function write(k,v){localStorage.setItem(key(k),JSON.stringify(v));}
function events(){return Object.keys(localStorage).filter(k=>k.startsWith(key('event.'))).map(k=>JSON.parse(localStorage[k])).sort((a,b)=>a.at-b.at);}
function profile(){return read('profile',{pet:'eule',name:'',school:''});}
function recordProfile(patch){write('profile',{...profile(),...patch});write('patch',{...read('patch',{}),...patch});sync();}
function node(tag,text='',parent=world,cls=''){const n=document.createElement(tag);n.textContent=text;n.className=cls;parent.append(n);return n;}
function btn(text,fn,parent=world,cls=''){const n=node('button',text,parent,cls);n.onclick=fn;return n;}
function link(text,href,parent=world){const a=node('a',text,parent,'action');a.href=href;return a;}
function picture(id,parent,cls='pet'){const im=node('img','',parent,cls);im.src=id+'.webp';im.alt=pets[id]||'';return im;}
function stop(){epoch++;player.pause();player.onended=null;}
async function speak(...keys){stop();const id=epoch;if(muted)return;await ready;
 for(const k of keys){if(epoch!==id||!voice[k])return;player.src='data:audio/mpeg;base64,'+voice[k];await new Promise(resolve=>{player.onended=resolve;player.onerror=resolve;player.play().catch(resolve);});}}
const ready=fetch('stimme.json').then(r=>r.json()).then(v=>voice=v).catch(()=>{});
function screen(id,keys=[]){stop();view=id;world.replaceChildren();narration=keys;world.focus({preventScroll:true});const w=wallet(events());document.querySelector('#money').textContent=w.earned-spent();}
function spent(){return (cloud?.claims||read('claims',[])).filter(c=>c.status!=='storniert').reduce((a,c)=>a+c.cost,0);}
function pet(parent=world){const p=profile();picture(pets[p.pet]?p.pet:'eule',parent,'mini');}
function home(){
 screen('home',['start']);const p=profile(),w=wallet(events()),hero=node('div','',world,'hero');hero.style.backgroundImage='url(insel.webp)';
 for(const [i,place] of places.entries()){
  const pin=btn(place.icon,()=>start(place.id),hero,'map-pin pin'+i);pin.setAttribute('aria-label','Besuche '+place.name);
 }
 const label=node('div','',hero);node('h1',owner==='guest'&&legacy('name')?legacy('name')+'s Wörterinsel':'Meine Wörterinsel',label);
 const path=['atelier','wald','atelier','bach','post'];const earned=events();const recommended=earned.slice(-2).length===2&&earned.slice(-2).every(e=>e.helped)?earned.at(-1).place:path[Math.floor(earned.length/3)%path.length];
 node('p','Nächster Halt · '+places.find(p=>p.id===recommended).name,label);
 btn('▶  Weiterspielen',()=>read('chosen',false)?start(recommended):friends(),label,'primary');
 const bar=node('div','',world,'row');pet(bar);btn(p.name||pets[p.pet]||'Begleiter',friends,bar);node('span','Level '+w.level+' · noch '+w.next+' Münzen',bar);
 const grid=node('div','',world,'grid');
 for(const place of places){const b=btn('',()=>start(place.id),grid,'place');b.style.background=place.colour;node('span',place.icon,b);node('b',place.name,b);node('small',place.subtitle,b);}
 link('✉ Kartenwerkstatt','post.html');btn('Schatztruhe',treasure);btn('Kinderkonto',login);
}
function friends(){
 screen('friends',['start']);node('h1','Wer kommt mit?');const row=node('div','',world,'row');
 for(const [id,label] of Object.entries(pets)){const b=btn('',()=>{recordProfile({pet:id,name:input.value.trim().slice(0,18)});write('chosen',true);start('atelier');},row,'pet-choice');picture(id,b);b.setAttribute('aria-label',label);node('b',label,b);}
 const l=node('label','Name deines Tiers (freiwillig) ');const input=node('input','',l);input.maxLength=18;input.value=profile().name||'';speak('start');
}
function start(id){
 const place=places.find(p=>p.id===id)||places[1];write('last',place.id);
 round={place,items:curriculum(place.id,events(),profile().school),i:0,help:0,id:crypto.randomUUID()};task(true);
}
function task(announce){
 const {place,items,i}=round,q=items[i],rev=q.kind==='reverse';
 const prompts=[q.kind,...(rev?[]:[q.sound])];
 screen('task',prompts);node('p',place.name+' · '+(i+1)+' von 3',world,'tag');pet();
 const titles={forest:'Hörst du den Anfang?',atelier:'Welches Zeichen klingt so?',reverse:'Wie klingt '+q.target+'?',brook:'Über die Lautsteine',post:'Ein Brief für dein Tier'};
 node('h1',titles[q.kind]);const panel=node('div','',world,'panel');
 if(q.kind==='post'){if(round.help)node('p',q.word,panel,'tag');node('div',q.word.slice(0,q.slot)+'□'+q.word.slice(q.slot+1),panel,'word');btn('◖)) '+q.word,()=>speak(q.word),panel);}
 if(q.kind==='brook'){const bridge=btn(q.target[0]+'  ⌒  '+q.target[1],()=>speak(q.target),panel,'bridge');const guide=picture(profile().pet,panel,'mini traveller');const cross=()=>{guide.animate([{transform:'translateX(-48px)'},{transform:'translateX(48px)'}],{duration:window.matchMedia('(prefers-reduced-motion: reduce)').matches?0:700});speak(q.target);};
 bridge.onclick=cross;let begin;bridge.onpointerdown=e=>{begin=e.clientX;bridge.setPointerCapture(e.pointerId);};bridge.onpointerup=e=>{if(Math.abs(e.clientX-begin)>16)cross();};}
 if(q.kind==='reverse')node('strong',q.target,panel,'word');
 if(q.kind==='atelier'&&q.target==='m')node('p','Ein m für das Namensschild der Maus.',panel);
 const row=node('div','',panel,'row');
 for(const [idx,opt] of q.options.entries()){
  const group=node('div','',row,'listen');
  const b=btn(q.kind==='forest'?'':rev?'Muschel '+(idx+1):opt,()=>opt===q.target?complete():assist(),group,'tile'+(round.help&&opt===q.target?' lit':''));
  if(q.kind==='forest'){picture(words[opt],b);b.setAttribute('aria-label',opt);}
  if(q.kind==='forest'||rev)btn('◖)) Anhören',()=>speak(opt),group);
 }
 const actions=node('div','',world,'row');btn('☞ Zeig mir',assist,actions);btn('✋ Zusammen machen',()=>{round.help++;complete();},actions);
 if(q.kind==='atelier')btn('✎ Schreibspur',()=>sketch(panel,q.target),actions);
 if(announce)speak(...prompts);
}
function sketch(panel,char){
 if(panel.querySelector('canvas'))return;
 const c=node('canvas','',panel,'paper');c.width=600;c.height=160;c.setAttribute('aria-label','Frei zeichnen: '+char);
 const ctx=c.getContext('2d');ctx.font='115px sans-serif';ctx.fillStyle='#ddcebc';ctx.fillText(char,220,124);
 const pos=e=>{const r=c.getBoundingClientRect();return [(e.clientX-r.x)*600/r.width,(e.clientY-r.y)*160/r.height];};
 c.onpointerdown=e=>{c.setPointerCapture(e.pointerId);ctx.beginPath();ctx.moveTo(...pos(e));};c.onpointermove=e=>{if(c.hasPointerCapture(e.pointerId)){ctx.lineWidth=5;ctx.lineTo(...pos(e));ctx.stroke();}};c.onpointerup=()=>{round.traced=true;};
}
function assist(){round.help++;task(false);speak('help',round.items[round.i].sound);}
function complete(){
 if(view!=='task')return;const q=round.items[round.i],id=round.id;
 if(q.kind==='post' && !round.help && !round.built && q.word.length>2){
  round.built=true;const remaining=(q.slot+1)%q.word.length;q.slot=remaining;q.target=q.word[remaining];
  const other=remaining===0?(q.target==='M'?'P':'M'):(q.target==='m'?'l':'m');q.options=[other,q.target];task(true);return;
 }
 const e={id,place:round.place.id,kind:q.kind,target:q.target,helped:round.help>0,traced:!!round.traced,at:Date.now()};
 write('event.'+id,e);write('pending.'+id,true);sync();screen('earned',[q.sound,'done']);const box=node('div','',world,'panel shine');pet(box);node('h1',q.kind==='post'?q.word:q.target,box);const coins=wallet(events());node('p','Eine Münze für dich!',box,'coin');
 if(coins.earned%10===0){node('h2','Level '+coins.level+' erreicht!',box);picture(['eule','falter','eichhorn','storch'][Math.min(coins.level-1,3)],box);}
 speak(q.sound,'done');
 btn(round.i===2?'Reise abschliessen':'Weiter ›',()=>{if(round.i===2){home();speak('end');}else{round.i++;round.id=crypto.randomUUID();round.help=0;round.traced=false;round.built=false;task(true);}},box,'primary');btn('Pause · zur Insel',home,box);
 if(round.place.id==='post')link('Eigene Karte gestalten','post.html',box);
}
let syncing=false, repeatSync=false;
async function sync(){
 if(syncing){repeatSync=true;return;}if(!account||owner==='guest'||!navigator.onLine)return;
 syncing=true;try{
  const pending=events().filter(e=>localStorage.getItem(key('pending.'+e.id)));
  for(let i=0;i<pending.length;i+=100){const chunk=pending.slice(i,i+100);await account.request('sync',{events:chunk});for(const e of chunk)localStorage.removeItem(key('pending.'+e.id));}
  const patch=read('patch',{});if(Object.keys(patch).length){await account.request('profile',patch);if(JSON.stringify(patch)===JSON.stringify(read('patch',{})))localStorage.removeItem(key('patch'));}
  cloud=await account.request('read');for(const e of cloud.events)write('event.'+e.id,e);
  const merged={...profile(),...cloud.profile,...read('patch',{})};write('profile',merged);
  for(const k of ['name','card','words','voices'])if(Object.hasOwn(merged,'mail_'+k))localStorage.setItem('insel.mail.'+owner+'.'+k,JSON.stringify(merged['mail_'+k]));write('claims',cloud.claims);issue='';if(view==='home')home();
 }catch{issue='Abgleich ausstehend.';}finally{syncing=false;if(repeatSync){repeatSync=false;queueMicrotask(sync);}}
}
async function login(){
 screen('login');node('h1','Kinderkonto');if(owner!=='guest'){
 const previous=localStorage.getItem('insel.guest-import');
 if((!previous||previous===owner)&&!read('imported',false)){
  btn('Meine lokalen Inselrunden und Karte übernehmen',async()=>{
   if(previous&&previous!==owner)return;
   const prefix='insel.v2.guest.event.';for(const k of Object.keys(localStorage).filter(k=>k.startsWith(prefix))){const e=JSON.parse(localStorage[k]);write('event.'+e.id,e);write('pending.'+e.id,true);}
   const patch={};for(const k of ['name','card','words','voices']){const v=legacy(k);if(v)patch['mail_'+k]=v;}
   localStorage.setItem('insel.guest-import',owner);write('imported',true);recordProfile(patch);home();
  });
 }
 btn('Google-Konto verknüpfen',async()=>{try{await account.linkGoogle();}catch{node('p','Diese Google-Verknüpfung ist zurzeit nicht verfügbar.');}});btn('Abmelden',async()=>{await account.client.auth.signOut();localStorage.removeItem('insel.active');location.reload();});return;}
 const form=node('form');const u=node('input','',node('label','Benutzername ',form));const p=node('input','',node('label','Passwort ',form));p.type='password';const submit=node('button','Anmelden',form);const msg=node('p','',form);
 form.onsubmit=async e=>{e.preventDefault();submit.disabled=true;try{account=await import('./familie.js');await account.childLogin(u.value,p.value);const data=await account.request('read');if(data.role!=='child')throw Error('Kinderkonto erforderlich.');localStorage.setItem('insel.active',data.family);location.reload();}catch(err){msg.textContent=err.message;}finally{submit.disabled=false;}};
}
async function treasure(){
 screen('treasure');node('h1','Deine Schatztruhe');const w=wallet(events());node('p',w.earned+' Münzen gesammelt · Level '+w.level);
 const progress=node('progress');progress.value=w.earned%10;progress.max=10;node('p','Noch '+w.next+' bis zur nächsten Stufe.');
 for(const [i,id] of ['eule','falter','eichhorn','storch'].entries()){if(w.level>i)picture(id,world,'mini');}
 if(owner==='guest'){node('p','Hier sammelst du Inselbilder. Familienpreise findest du mit deinem Kinderkonto.');btn('Kinderkonto',login);return;}
 await sync();if(view!=='treasure')return;
 node('p',issue||'Deine Familienpreise');for(const prize of cloud?.prizes.filter(p=>p.available)||[]){
 const b=btn(prize.title+' · '+prize.price+' Münzen',()=>{
  const requestId=read('request.'+prize.id,crypto.randomUUID());write('request.'+prize.id,requestId);
  const panel=node('div','',world,'panel');node('h2',prize.title,panel);node('p',prize.price+' Münzen einlösen?',panel);
  btn('Zurück',treasure,panel);const yes=btn('Ja, einlösen',async()=>{yes.disabled=true;try{cloud=await account.request('claim',{id:prize.id,request:requestId});localStorage.removeItem(key('request.'+prize.id));treasure();}catch{node('p','Bitte Verbindung und Guthaben prüfen.',panel);yes.disabled=false;}},panel,'primary');
 });picture(['eule','maus','drache','apfel'].includes(prize.image)?prize.image:'eule',b,'mini');btn('Preis anhören',()=>{const u=new SpeechSynthesisUtterance(prize.title+' für '+prize.price+' Münzen');u.lang='de-CH';const v=speechSynthesis.getVoices().find(v=>v.localService&&v.lang.startsWith('de'));if(v){u.voice=v;speechSynthesis.speak(u);}},world);b.disabled=(cloud?.claims||[]).some(c=>c.prize===prize.id&&c.status==='offen')||!navigator.onLine||!!issue||w.earned-spent()<prize.price;}
 for(const c of cloud?.claims||[])node('p',c.title+' · '+c.status);
}
document.querySelector('#home').onclick=home;document.querySelector('#parents').onclick=()=>location.assign('eltern.html');document.querySelector('#treasure').onclick=treasure;
document.querySelector('#sound').onclick=()=>speak(...narration);document.querySelector('#quiet').onclick=e=>{muted=!muted;stop();e.target.textContent=muted?'Ton an':'Ton aus';e.target.setAttribute('aria-pressed',muted);};
owner=localStorage.getItem('insel.active')||'guest';home();
if(owner!=='guest'){import('./familie.js').then(m=>{account=m;return sync();});}
window.addEventListener('online',sync);
if('serviceWorker' in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{});
