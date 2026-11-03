// Reusable admin UI. The adapter must verify the user and admin rights on the server.
const form=document.querySelector('#composer');
const message=document.querySelector('#message');
const count=document.querySelector('#count');
const send=document.querySelector('#send');
const review=document.querySelector('#review');
const preview=document.querySelector('#preview');
const confirm=document.querySelector('#confirm');
const cancel=document.querySelector('#cancel');
const status=document.querySelector('#status');
let pending=false;
let requestKey=null;
let approvedMessage=null;
const endpoint=window.WEB_KIT_WHATSAPP_ENDPOINT;
const getToken=window.WEB_KIT_GET_ACCESS_TOKEN;
// Nach einem Fehler bleibt die Request-ID bestehen: Ein erneuter Klick löst keinen zweiten Versand aus.
function errorText(code){
  if(code===401)return 'Sitzung abgelaufen. Bitte neu anmelden.';
  if(code===403)return 'Keine Berechtigung für den Versand.';
  if(code===429)return 'Bereits gesendet oder Limit erreicht (10 pro Stunde). Nicht erneut senden.';
  if(code===504)return 'Versandstatus unklar. Bitte zuerst in der WhatsApp-Gruppe prüfen, bevor erneut gesendet wird.';
  if(code===502)return 'WhatsApp-Dienst hat abgelehnt. Nachricht wurde nicht gesendet.';
  return 'Versand fehlgeschlagen (HTTP '+code+').';
}
message.addEventListener('input',()=>{count.textContent=String(message.value.length);send.disabled=!message.value.trim()||pending;review.hidden=true;requestKey=null;approvedMessage=null;status.textContent='';});
form.addEventListener('submit',event=>{event.preventDefault();if(!message.value.trim()||pending)return;approvedMessage=message.value.trim();preview.textContent=approvedMessage;requestKey=crypto.randomUUID();review.hidden=false;confirm.focus();});
cancel.addEventListener('click',()=>{review.hidden=true;approvedMessage=null;requestKey=null;send.focus();});
confirm.addEventListener('click',async()=>{
  if(pending||review.hidden||!approvedMessage||message.value.trim()!==approvedMessage||!requestKey)return;
  if(typeof endpoint!=='string'||!endpoint.startsWith('https://')||typeof getToken!=='function'){
    status.textContent='Versand noch nicht eingerichtet: Geschützter Server-Endpunkt und Anmeldung fehlen.';return;
  }
  pending=true;confirm.disabled=true;send.disabled=true;status.textContent='Nachricht wird gesendet …';
  try{
    const token=await getToken();
    if(!token)throw new Error('Bitte zuerst als Administrator anmelden.');
    const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token,'apikey':'sb_publishable_Qeom38G18vSgrrE5MxoXEw_LhJM1f6S'},body:JSON.stringify({message:approvedMessage,requestKey})});
    // Nur bei eindeutiger Ablehnung (502) darf ein bewusster neuer Versuch eine neue Request-ID erhalten.
    if(response.status===502)requestKey=crypto.randomUUID();
    if(!response.ok)throw new Error(errorText(response.status));
    status.textContent='WhatsApp-Dienst hat die Nachricht für Camino angenommen. Die Zustellung ist damit noch nicht bestätigt.';message.value='';count.textContent='0';review.hidden=true;approvedMessage=null;requestKey=null;
  }catch(error){status.textContent=error instanceof Error?error.message:'Versand fehlgeschlagen.';}
  finally{pending=false;confirm.disabled=false;send.disabled=!message.value.trim();}
});

// Die Ansicht lädt nur auf ausdrückliche Anforderung und speichert keine Kontakte dauerhaft.
const contactsList=document.querySelector('#contacts-list');
const contactsStatus=document.querySelector('#contacts-status');
const contactsSearch=document.querySelector('#contacts-search');
const contactsButton=document.querySelector('#load-contacts');
let contacts=[];
let contactsRequest=0;
function clearContacts(){ contactsRequest++; contacts=[];contactsList.replaceChildren();contactsSearch.value='';contactsStatus.textContent=''; }
function renderContacts(){
  const query=contactsSearch.value.trim().toLocaleLowerCase('de-CH');
  const fragment=document.createDocumentFragment();
  for(const contact of contacts){
    const label=(contact.name||contact.id)+' · '+(contact.type==='group'?'Gruppe':'Kontakt')+' · '+contact.id;
    if(query&&!label.toLocaleLowerCase('de-CH').includes(query))continue;
    const item=document.createElement('li');item.textContent=label;fragment.append(item);
  }
  contactsList.replaceChildren(fragment);
}
contactsSearch.addEventListener('input',renderContacts);
document.querySelector('#logout').addEventListener('click',clearContacts);
contactsButton.addEventListener('click',async()=>{
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
