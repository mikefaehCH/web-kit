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
    if(!response.ok)throw new Error('Versand fehlgeschlagen (HTTP '+response.status+').');
    status.textContent='Nachricht an Camino gesendet.';message.value='';count.textContent='0';review.hidden=true;approvedMessage=null;requestKey=null;
  }catch(error){status.textContent=error instanceof Error?error.message:'Versand fehlgeschlagen.';}
  finally{pending=false;confirm.disabled=false;send.disabled=!message.value.trim();}
});