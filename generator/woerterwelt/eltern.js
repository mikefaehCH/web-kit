import {client,request,google,manageChild} from './familie.js';
const main=document.querySelector('#family');let state;
function el(tag,text,parent=main){const n=document.createElement(tag);n.textContent=text;parent.append(n);return n;}
function button(text,fn,parent=main){const b=el('button',text,parent);b.onclick=async()=>{b.disabled=true;try{await fn();}catch(e){el('p',e.message,parent);}finally{b.disabled=false;}};return b;}
function field(text,parent,type='text'){const label=el('label',text+' ',parent);const i=el('input','',label);i.type=type;return i;}
function panel(title){const d=el('section','');d.className='panel';el('h2',title,d);return d;}
function draw(){
 main.replaceChildren();el('h1','Unsere Wörterinsel');
 const obs=panel('Lernmomente');const groups=new Map();
 for(const e of state.events){const k=e.kind+' · '+e.target;if(!groups.has(k))groups.set(k,[]);groups.get(k).push(e);}
 const types={atelier:'Laut zu Zeichen',forest:'Anlaut',reverse:'Zeichen zu Laut',brook:'Silbe',post:'Buchstabe im Wort'};
 if(!groups.size)el('p','Hier erscheint die erste gespielte Runde.',obs);
 for(const series of [...groups.values()].slice(-8)){const e=series.at(-1);const aided=series.filter(x=>x.helped).length;
 el('p',types[e.kind]+' «'+e.target+'» · '+(series.length-aided)+' selbst gelöst, '+aided+' mit Hilfe.',obs);}
 const s=panel('Schulbuchstabe');const letter=field('Für die nächste Runde (m, a, i, l, o, p)',s);letter.value=state.profile.school||'';
 button('Übernehmen',async()=>{const school=letter.value.trim().toLowerCase();if(!['','m','a','i','l','o','p'].includes(school))throw Error('Bitte einen eingeführten Buchstaben wählen.');state=await request('profile',{school});draw();},s);
 const prizes=panel('Familienpreise');const title=field('Preis',prizes);const cost=field('Münzen',prizes,'number');cost.min=1;cost.max=10000;cost.value='10';
 const img=el('select','',el('label','Preisbild ',prizes));for(const x of ['eule','maus','drache','apfel']){const o=el('option',x,img);o.value=x;}
 button('Preis anbieten',async()=>{if(!title.value.trim()||!cost.checkValidity())throw Error('Titel und Münzpreis prüfen.');state=await request('prize',{title:title.value.trim(),price:Number(cost.value),image:img.value});draw();},prizes);
 for(const p of state.prizes)button(p.title+' · '+p.price+' · '+(p.available?'pausieren':'anbieten'),async()=>{state=await request('toggle',{id:p.id});draw();},prizes);
 const requests=panel('Einlösungen');for(const c of state.claims){el('p',c.title+' · '+c.cost+' Münzen · '+c.status,requests);if(c.status==='offen')for(const status of ['erfüllt','storniert'])button(status,async()=>{state=await request('status',{id:c.id,status});draw();},requests);}
 const family=panel('Familienzugänge');const email=field('Google-Adresse des zweiten Elternteils',family,'email');button('Zugang vormerken',async()=>{if(!email.value||!email.checkValidity())throw Error('Adresse prüfen.');await request('invite',{email:email.value});el('p','Beim ersten Google-Login mit dieser Adresse tritt die Person der Familie bei.',family);},family);
 const username=field('Benutzername des Kindes',family);const pass=field('Neues Passwort',family,'password');
 for(const [caption,mode] of [['Kinderkonto anlegen','create'],['Passwort setzen','reset']])button(caption,async()=>{await manageChild(username.value,pass.value,mode);pass.value='';el('p','Gespeichert.',family);},family);
 button('Elternbereich schliessen',async()=>{await client.auth.signOut({scope:'local'});location.replace('./');});
}
async function enter(){
 const {data}=await client.auth.getSession();
 if(!data.session){button('Mit Google anmelden',google);
 const login=panel('Mit E-Mail und Passwort');const email=field('E-Mail',login,'email');const pw=field('Passwort',login,'password');
 button('Anmelden',async()=>{const {error}=await client.auth.signInWithPassword({email:email.value.trim(),password:pw.value});if(error)throw error;await enter();},login);
 button('Neues Elternkonto erstellen',async()=>{const {error}=await client.auth.signUp({email:email.value.trim(),password:pw.value});if(error)throw error;el('p','Bitte bestätige die E-Mail und melde dich anschliessend hier an.',login);},login);return;}
 state=await request('join');if(state.role!=='parent')throw Error('Bitte mit einem Elternkonto anmelden.');draw();
}
enter().catch(e=>{el('p',e.message);button('Abmelden',async()=>{await client.auth.signOut({scope:'local'});location.reload();});});

window.addEventListener('pagehide',()=>{sessionStorage.removeItem('insel.parent.v2');});
window.addEventListener('pageshow',e=>{if(e.persisted)location.reload();});
