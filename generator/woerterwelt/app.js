const stage = document.querySelector('#stage');
const prefix = 'woerterwelt.v1.';
const read = (key, fallback) => JSON.parse(localStorage.getItem(prefix+key) || JSON.stringify(fallback));
function save(key,value) {
 try { localStorage.setItem(prefix+key,JSON.stringify(value)); return true; }
 catch { alert('Der Gerätespeicher ist voll. Speichern war nicht möglich.'); return false; }
}
let name = read('name','Mia'), target = 'Papi', step = 0, help = 0, muted = false;
const invitedName = new URLSearchParams(location.hash.slice(1)).get('vorname');
if (invitedName && /^\p{L}[\p{L} -]{0,17}$/u.test(invitedName)) {
 name = invitedName;
 save('name', name);
 history.replaceState(null, '', location.pathname + location.search);
}
let card, recorder, stream, session = 0;
const player = new Audio();
const clips = await fetch('audio.json').then(r => r.json());
const hints = ['Hoi! Wollen wir eine Karte für Papi machen?','Tippe auf das i in deinem Namen.','Findest du das i in Papi?','Welcher Buchstabe fehlt vorne?','Noch einmal versuchen?','Welcher Buchstabe stand vorne?','Gestalte deine Karte.','Deine Karte ist fertig!'];
function stop() { session++; player.pause(); player.onended=null; window.speechSynthesis?.cancel(); }
function clip(id,next) {
 if(muted) return;
 player.src='data:audio/mpeg;base64,'+clips[id]; player.onended=next || null;
 player.play().catch(()=>{});
}
function localVoice(text,fallback) {
 const synth=window.speechSynthesis;
 const voice=synth?.getVoices().filter(v=>v.localService && v.lang.startsWith('de')).sort((a,b)=>Number(b.lang==='de-CH')-Number(a.lang==='de-CH'))[0];
 if(!voice) { if(fallback!==undefined) clip(fallback); return; }
 const utterance=new SpeechSynthesisUtterance(text); utterance.voice=voice; utterance.rate=.85; synth.speak(utterance);
}
function say() {
 stop(); if(muted || step>7) return;
 if(step===0) localVoice('Hoi '+name+'! Wollen wir eine Karte für Papi machen?',0);
 else if(step===1) clip(name.includes('i')?1:13,()=>clip(11));
 else if(step===2 && target!=='Papi') clip(13);
 else if(step===3 && target!=='Papi') readWord(()=>clip(15));
 else if(step===3) clip(3);
 else clip(step);
}
function readWord(next) {
 if(muted) {next?.();return;}
 if(target==='Papi') {clip(10,next);return;}
 const recording=read('voices',{})[target];
 if(recording){player.src=recording;player.onended=next||null;player.play().catch(()=>{});}
 else {localVoice(target); if(next && !window.speechSynthesis?.speaking) next();}
}
function element(tag,text,parent=stage) {
 const node=document.createElement(tag); node.textContent=text;parent.append(node);return node;
}
function button(text,fn,cls='',parent=stage) {
 const b=element('button',text,parent); b.className=cls;b.onclick=fn;return b;
}
function go(n,announce=true) {
 stop(); if(recorder?.state==='recording') recorder.stop();stream?.getTracks().forEach(t=>t.stop());
 step=n;help=0;render();if(announce)say();
}
function progress(value){save('progress',{...read('progress',{}),[target]:value});}
function newRound(word) {target=word;card={word,color:'#fce7c6',sticker:'',stamp:'',lines:[]};go(word==='Papi'?1:2);}
function guidance() {
 help++;render();stop();clip(help===1?8:9);
}
function puzzle() {
 const discovery=step<3;
 const word=step===1?(name.includes('i')?name:'Mia'):target;
 const wanted=discovery?(word.includes('i')?'i':word[0]):target[0];
 element('h1',step===1?word:discovery?target:step===5 && !help?'…':target);
 element('p',step===1&&!name.includes('i')?'Entdecke das i in Mia.':step===2&&target!=='Papi'?'Finde '+wanted+'.':hints[step]);
 if(!discovery) element('div','□'+target.slice(1)).className='word';
 const row=element('div',''); row.className='row';
 const choices=discovery?[...word]:step===5?[wanted,wanted==='M'?'P':'M']:[wanted==='M'?'P':'M',wanted];
 function complete() {
  stop();if(!discovery) progress(step===3?'Mit Vorlage gelegt':help?'Mit Hilfe gelegt':'Aus dem Gedächtnis gelegt');
  stage.replaceChildren();element('h1',word);
  const advance=()=>go(step===1?2:step===2?3:step===3?4:6);
  button('Weiter ›',advance,'primary');
  if(discovery && wanted==='i')clip(11);
  else if(target==='Papi')clip(12,()=>clip(10)); else readWord();
 }
 choices.forEach((value,i)=>{
  const lit=value===wanted && (help>0 || step===1 && i===word.indexOf(wanted));
  button(value,value===wanted?complete:guidance,'tile'+(lit?' lit':''),row);
 });
 button(help?'✋ Gemeinsam legen':'☞ Zeig mir',help?complete:guidance);
 if(step===5)button('Zur Karte ›',()=>go(6));
}
function drawCard(edit) {
 const box=element('div','');box.className='card';box.style.background=card.color;
 element('small',card.sticker || 'Für',box);element('strong',card.word,box);
 const canvas=element('canvas','',box);canvas.width=900;canvas.height=190;canvas.setAttribute('aria-label','Platz für deine Unterschrift');
 const ctx=canvas.getContext('2d');ctx.lineCap='round';ctx.lineWidth=5;ctx.strokeStyle='#30453e';
 function paint(line){ctx.beginPath();ctx.moveTo(...line[0]);for(const pt of line)ctx.lineTo(...pt);ctx.stroke();}
 card.lines.forEach(paint);
 if(edit){
  const point=e=>{const r=canvas.getBoundingClientRect();return [(e.clientX-r.x)*900/r.width,(e.clientY-r.y)*190/r.height];};
  canvas.onpointerdown=e=>{canvas.setPointerCapture(e.pointerId);card.lines.push([point(e)]);};
  canvas.onpointermove=e=>{if(canvas.hasPointerCapture(e.pointerId)){const line=card.lines.at(-1);line.push(point(e));paint(line.slice(-2));}};
 }
 element('div',card.stamp,box).className='signed';
}
function render() {
 stage.replaceChildren();
 if(step===0){
  element('h1',name);element('p','Eine Karte für Papi');button('▶  Los geht’s',()=>newRound('Papi'),'primary');
  for(const w of read('words',[]))button(w,()=>newRound(w));
  const saved=read('card',null);if(saved)button('Meine Karte',()=>{card=saved;go(7);});return;
 }
 if([1,2,3,5].includes(step)){puzzle();return;}
 if(step===4){element('h1',target);element('p',hints[4]);button('Zur Karte ›',()=>go(6),'primary');button('Nochmals legen',()=>go(5));return;}
 if(step===6||step===7){
  element('h1',step===6?'Deine Werkstatt':'Deine Karte');drawCard(step===6);
  if(step===7){button('⌂ Startseite',()=>go(0),'primary');return;}
  const row=element('div','');row.className='row';
  for(const [label,color] of [['Aprikose','#fce7c6'],['Minze','#cce8dc'],['Flieder','#e4d8ef']])button(label,()=>{card.color=color;render();},'',row);
  button('♥ Herz',()=>{card.sticker='♥';render();});button('Stempel '+name,()=>{card.stamp=name;render();});
  button('Fertig ✓',()=>{if(save('card',card))go(7);},'primary');return;
 }
 parents();
}
function parents(){
 element('h1','Für Eltern');element('p','Name, Wörter, Stimme und die zuletzt fertige Karte bleiben auf diesem Gerät.');
 function field(label,value){const l=element('label',label+' ');const input=element('input','',l);input.value=value;input.maxLength=18;return input;}
 const n=field('Vorname',name);button('Namen übernehmen',()=>{const v=n.value.trim();if(v&&save('name',v)){name=v;go(0);}});
 const w=field('Eigenes Wort','');const status=element('p','');
 function word(){const s=w.value.trim();if(!/^\p{L}{1,14}$/u.test(s)){status.textContent='Bitte ein Wort mit 1 bis 14 Buchstaben eingeben.';return '';}return s;}
 function add(value){return save('words',[...new Set([...read('words',[]),value])]);}
 button('Wort hinzufügen',()=>{const v=word();if(v&&add(v))status.textContent=v+' ist auf der Startseite.';});
 if(navigator.mediaDevices?.getUserMedia && window.MediaRecorder){
 const record=button('Wort aufnehmen',async()=>{
  if(recorder?.state==='recording'){recorder.stop();return;}
  const v=word();if(!v)return;record.disabled=true;
  try {
   const mic=await navigator.mediaDevices.getUserMedia({audio:true});
   if(!record.isConnected){mic.getTracks().forEach(t=>t.stop());return;}
   stream=mic;recorder=new MediaRecorder(mic);const chunks=[];
   recorder.ondataavailable=e=>chunks.push(e.data);
   const active=recorder;const limit=setTimeout(()=>{if(active.state==='recording')active.stop();},10000);
   recorder.onstop=()=>{clearTimeout(limit);mic.getTracks().forEach(t=>t.stop());const r=new FileReader();
    r.onload=()=>{if(save('voices',{...read('voices',{}),[v]:r.result})&&add(v))status.textContent='Aufnahme gespeichert.';};r.readAsDataURL(new Blob(chunks,{type:active.mimeType}));record.textContent='Wort aufnehmen';};
   active.start();record.textContent='Aufnahme beenden';
  }catch{status.textContent='Mikrofon nicht verfügbar. Das Wort lässt sich auch ohne Aufnahme hinzufügen.';}finally{record.disabled=false;}
 });
 }
 for(const [w,v] of Object.entries(read('progress',{})))element('p',w+' · '+v);
}
document.querySelector('#home').onclick=()=>go(0);
document.querySelector('#parent').onclick=()=>go(8,false);
document.querySelector('#repeat').onclick=say;
document.querySelector('#mute').onclick=e=>{muted=!muted;stop();e.target.textContent=muted?'Ton an':'Ton aus';e.target.setAttribute('aria-pressed',muted);};
render();
if('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(()=>{});
