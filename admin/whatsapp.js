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
let pending=false;
let requestKey=null;
let approvedMessage=null;
const endpoint=window.WEB_KIT_WHATSAPP_ENDPOINT;
const getToken=window.WEB_KIT_GET_ACCESS_TOKEN;
const interruptedKey='web-kit-whatsapp-in-progress';
const resolveInterrupted=document.querySelector('#resolve-interrupted');
function hasInterrupted(){try{return sessionStorage.getItem(interruptedKey)!==null;}catch{return true;}}
function showInterrupted(){resolveInterrupted.hidden=!hasInterrupted();}
resolveInterrupted.addEventListener('click',()=>{try{sessionStorage.removeItem(interruptedKey);}catch{return;}showInterrupted();status.textContent='Du kannst eine neue Nachricht erstellen.';});
showInterrupted();
function invalidate(){review.hidden=true;approvedMessage=null;requestKey=null;send.disabled=!message.value.trim()||pending;}
function textItem(list,value){const li=document.createElement('li');li.textContent=value;list.append(li);return li;}
message.addEventListener('input',()=>{count.textContent=String(message.value.length);invalidate();});
form.addEventListener('submit',event=>{
  event.preventDefault();
  if(!message.value.trim()||pending)return;
  if(hasInterrupted()){status.textContent='Bitte prüfe zuerst den unterbrochenen Versand in WhatsApp und bestätige dies.';showInterrupted();return;}
  approvedMessage=message.value.trim();requestKey=crypto.randomUUID();
  preview.textContent=approvedMessage;previewRecipients.replaceChildren();results.replaceChildren();
  textItem(previewRecipients,'Camino-Gruppe');
  review.hidden=false;confirm.focus();
});
cancel.addEventListener('click',()=>{invalidate();send.focus();});
if(hasInterrupted())status.textContent='Ein vorheriger Versand wurde unterbrochen. Bitte prüfe in WhatsApp, welche Nachrichten angekommen sind, bevor du erneut sendest.';
function errorText(code){
  if(code===401)return 'Sitzung abgelaufen. Bitte neu anmelden.';
  if(code===403)return 'Keine Berechtigung für den Versand.';
  if(code===429)return 'Bereits gesendet oder Limit erreicht (10 pro Stunde). Bitte zuerst die WhatsApp-Gruppe prüfen.';
  if(code===504)return 'Versandstatus unklar. Bitte zuerst die WhatsApp-Gruppe prüfen.';
  if(code===502)return 'WhatsApp-Dienst hat die Nachricht eindeutig abgelehnt.';
  return 'Versand fehlgeschlagen (HTTP '+code+'). Bitte vor einem neuen Versuch die WhatsApp-Gruppe prüfen.';
}
confirm.addEventListener('click',async()=>{
  if(pending||review.hidden||!approvedMessage||message.value.trim()!==approvedMessage||!requestKey)return;
  if(typeof endpoint!=='string'||!endpoint.startsWith('https://')||typeof getToken!=='function'){
    status.textContent='Versand ist noch nicht eingerichtet.';return;
  }
  pending=true;confirm.disabled=true;send.disabled=true;cancel.disabled=true;message.disabled=true;
  let token;try{token=await getToken();}catch{token=null;}
  if(!token){pending=false;confirm.disabled=false;cancel.disabled=false;message.disabled=false;invalidate();status.textContent='Bitte zuerst als Administrator anmelden.';return;}
  results.replaceChildren();status.textContent='Nachricht wird übermittelt …';
  const item=textItem(results,'Camino-Gruppe: wird übermittelt …');
  try{
    sessionStorage.setItem(interruptedKey,requestKey);
    const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token,'apikey':'sb_publishable_Qeom38G18vSgrrE5MxoXEw_LhJM1f6S'},body:JSON.stringify({message:approvedMessage,requestKey}),cache:'no-store'});
    const body=await response.json().catch(()=>null);
    if(response.ok&&body?.status==='accepted'){
      sessionStorage.removeItem(interruptedKey);item.textContent='Camino-Gruppe: vom WhatsApp-Dienst angenommen (Zustellung nicht bestätigt).';
      status.textContent='Versand abgeschlossen. Annahme ist keine Zustellbestätigung.';message.value='';count.textContent='0';invalidate();return;
    }
    if(response.status===502&&body?.status==='failed'){
      sessionStorage.removeItem(interruptedKey);item.textContent='Camino-Gruppe: vom WhatsApp-Dienst abgelehnt.';status.textContent=errorText(502);invalidate();return;
    }
    item.textContent='Camino-Gruppe: Status unklar. Vor erneutem Senden in WhatsApp prüfen.';status.textContent=errorText(response.status);
  }catch{
    item.textContent='Camino-Gruppe: Status unklar. Vor erneutem Senden in WhatsApp prüfen.';status.textContent='Versandstatus unklar. Bitte zuerst die WhatsApp-Gruppe prüfen.';
  }finally{
    pending=false;confirm.disabled=false;cancel.disabled=false;message.disabled=false;invalidate();showInterrupted();
  }
});
document.querySelector('#logout').addEventListener('click',()=>{preview.textContent='';previewRecipients.replaceChildren();results.replaceChildren();message.value='';count.textContent='0';status.textContent='';invalidate();});
