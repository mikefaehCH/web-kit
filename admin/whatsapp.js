// Reusable admin UI. The adapter must verify the user and admin rights on the server.
const form=document.querySelector('#composer');
const message=document.querySelector('#message');
const count=document.querySelector('#count');
const send=document.querySelector('#send');
const review=document.querySelector('#review');
const preview=document.querySelector('#preview');
const previewRecipients=document.querySelector('#preview-recipients');
const results=document.querySelector('#delivery-results');
const confirm=document.querySelector('#confirm');
const cancel=document.querySelector('#cancel');
const status=document.querySelector('#status');
const camino=document.querySelector('#camino-recipient');
let pending=false;
let approvedMessage=null;
let approvedRecipients=[];
let selected=new Map();
const endpoint=window.WEB_KIT_WHATSAPP_ENDPOINT;
const getToken=window.WEB_KIT_GET_ACCESS_TOKEN;
const caminoId='120363431174972238@g.us';
const interruptedKey='web-kit-whatsapp-in-progress';
const resolveInterrupted=document.querySelector('#resolve-interrupted');
function hasInterrupted(){try{return sessionStorage.getItem(interruptedKey)!==null;}catch{return true;}}
function showInterrupted(){resolveInterrupted.hidden=!hasInterrupted();}
resolveInterrupted.addEventListener('click',()=>{try{sessionStorage.removeItem(interruptedKey);}catch{return;}showInterrupted();status.textContent='Du kannst eine neue Nachricht erstellen.';});
showInterrupted();
function selectedRecipients(){
  const all=new Map(selected);
  if(camino.checked)all.set(caminoId,'Camino-Gruppe');
  return [...all].map(([id,name])=>({id,name}));
}
function invalidate(){review.hidden=true;approvedMessage=null;approvedRecipients=[];send.disabled=!message.value.trim()||pending||selectedRecipients().length===0;}
function textItem(list,value){const li=document.createElement('li');li.textContent=value;list.append(li);return li;}
message.addEventListener('input',()=>{count.textContent=String(message.value.length);invalidate();});
camino.addEventListener('change',invalidate);
form.addEventListener('submit',event=>{
  event.preventDefault();const recipients=selectedRecipients();
  if(!message.value.trim()||pending||!recipients.length)return;
  if(hasInterrupted()){status.textContent='Bitte prüfe zuerst den unterbrochenen Versand in WhatsApp und bestätige dies.';showInterrupted();return;}
  if(recipients.length>10){status.textContent='Pro Stunde sind höchstens 10 Versandversuche möglich. Bitte wähle weniger Empfänger.';return;}
  approvedMessage=message.value.trim();approvedRecipients=recipients.map(r=>({...r,key:crypto.randomUUID()}));
  preview.textContent=approvedMessage;previewRecipients.replaceChildren();results.replaceChildren();
  for(const r of approvedRecipients)textItem(previewRecipients,r.name+' · '+r.id);
  review.hidden=false;confirm.focus();
});
cancel.addEventListener('click',()=>{invalidate();send.focus();});
if(hasInterrupted())status.textContent='Ein vorheriger Versand wurde unterbrochen. Bitte prüfe in WhatsApp, welche Nachrichten angekommen sind, bevor du erneut sendest.';
confirm.addEventListener('click',async()=>{
  if(pending||review.hidden||!approvedMessage||message.value.trim()!==approvedMessage||!approvedRecipients.length)return;
  if(typeof endpoint!=='string'||!endpoint.startsWith('https://')||typeof getToken!=='function'){status.textContent='Versand ist noch nicht eingerichtet.';return;}
  pending=true;confirm.disabled=true;send.disabled=true;cancel.disabled=true;message.disabled=true;camino.disabled=true;
  let token;try{token=await getToken();}catch{token=null;}if(!token){pending=false;confirm.disabled=false;cancel.disabled=false;message.disabled=false;camino.disabled=false;invalidate();status.textContent='Bitte zuerst als Administrator anmelden.';return;}
  document.querySelectorAll('.contact-choice').forEach(el=>{el.disabled=true;});
  results.replaceChildren();status.textContent='Nachrichten werden einzeln übermittelt …';
  let interrupted=false;
  try{
    sessionStorage.setItem(interruptedKey,'1');
    for(const recipient of approvedRecipients){
      const item=textItem(results,recipient.name+': wird übermittelt …');
      try{
        const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token,'apikey':'sb_publishable_Qeom38G18vSgrrE5MxoXEw_LhJM1f6S'},body:JSON.stringify({action:'send_selected',chatId:recipient.id,message:approvedMessage,requestKey:recipient.key})});
        const body=await response.json().catch(()=>null);
        if(response.ok&&body?.status==='accepted'){item.textContent=recipient.name+': vom WhatsApp-Dienst angenommen (Zustellung nicht bestätigt).';continue;}
        if(response.status===502&&body?.status==='failed'){item.textContent=recipient.name+': vom Dienst abgelehnt.';continue;}
        item.textContent=recipient.name+': Status unklar oder Versand blockiert. Vor erneutem Senden in WhatsApp prüfen.';
        interrupted=true;break;
      }catch{item.textContent=recipient.name+': Status unklar. Vor erneutem Senden in WhatsApp prüfen.';interrupted=true;break;}
    }
    status.textContent=interrupted?'Versand angehalten. Weitere Empfänger wurden nicht verarbeitet.':'Versand abgeschlossen. Annahme ist keine Zustellbestätigung.';
    if(!interrupted)sessionStorage.removeItem(interruptedKey);
  }catch{status.textContent='Versand nicht gestartet oder unterbrochen. Bitte WhatsApp prüfen.';}
  finally{
    pending=false;confirm.disabled=false;cancel.disabled=false;message.disabled=false;camino.disabled=false;
    document.querySelectorAll('.contact-choice').forEach(el=>{el.disabled=false;});
    invalidate();showInterrupted();
  }
});
// Die Ansicht lädt nur auf ausdrückliche Anforderung und speichert keine Kontakte dauerhaft.
const contactsList=document.querySelector('#contacts-list');
const contactsStatus=document.querySelector('#contacts-status');
const contactsSearch=document.querySelector('#contacts-search');
const contactsButton=document.querySelector('#load-contacts');
let contacts=[];
let contactsRequest=0;
function clearContacts(){ contactsRequest++; selected.clear(); contacts=[]; contactsList.replaceChildren(); contactsSearch.value=''; contactsStatus.textContent=''; preview.textContent=''; previewRecipients.replaceChildren(); results.replaceChildren(); message.value=''; count.textContent='0'; status.textContent=''; invalidate(); }
function renderContacts(){
  const query=contactsSearch.value.trim().toLocaleLowerCase('de-CH');
  const fragment=document.createDocumentFragment();
  for(const contact of contacts){
    const label=(contact.name||contact.id)+' · '+(contact.type==='group'?'Gruppe':'Kontakt')+' · '+contact.id;
    if(query&&!label.toLocaleLowerCase('de-CH').includes(query))continue;
    const item=document.createElement('li');const choice=document.createElement('input');choice.type='checkbox';choice.className='contact-choice';choice.checked=selected.has(contact.id);choice.disabled=pending;choice.addEventListener('change',()=>{if(choice.checked)selected.set(contact.id,contact.name||contact.id);else selected.delete(contact.id);invalidate();});const text=document.createElement('label');text.append(choice,document.createTextNode(label));item.append(text);fragment.append(item);
  }
  contactsList.replaceChildren(fragment);
}
contactsSearch.addEventListener('input',renderContacts);
document.querySelector('#logout').addEventListener('click',clearContacts);
contactsButton.addEventListener('click',async()=>{
  if(pending)return;
  const request=++contactsRequest;
  contacts=[];contactsList.replaceChildren();contactsButton.disabled=true;contactsStatus.textContent='Kontakte werden geladen …';
  try{
    const token=await getToken();
    if(!token)throw new Error('Bitte zuerst als Administrator anmelden.');
    const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token,'apikey':'sb_publishable_Qeom38G18vSgrrE5MxoXEw_LhJM1f6S'},body:JSON.stringify({action:'list_contacts'}),cache:'no-store'});
    if(!response.ok)throw new Error('Kontakte konnten nicht geladen werden. Bitte später erneut versuchen.');
    const data=await response.json();
    if(!Array.isArray(data.contacts))throw new Error('Die Kontaktliste ist nicht verfügbar.');
    if(request!==contactsRequest)return;
    contacts=data.contacts.filter(c=>c&&typeof c.id==='string'&&typeof c.name==='string'&&(c.type==='user'||c.type==='group'));
    renderContacts();
    contactsStatus.textContent=contacts.length+' Kontakte und Gruppen geladen.'+(data.incomplete?' Einige Einträge konnten nicht übernommen werden.':'');
  }catch(error){if(request===contactsRequest)contactsStatus.textContent=error instanceof Error?error.message:'Kontakte konnten nicht geladen werden.';}
  finally{contactsButton.disabled=false;}
});
