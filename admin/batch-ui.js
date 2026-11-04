// This interface is disabled until the complete backend and database are reviewed.
if (window.WEB_KIT_WHATSAPP_BATCH_UI_ENABLED === true) {
  const $ = id => document.getElementById(id);
  const ui = $('batch-ui'), status = $('batch-ui-status'), list = $('batch-contacts'), jobs = $('batch-jobs'), results = $('batch-results');
  const message = $('batch-message'), preview = $('batch-preview'), selected = new Map();
  let epoch = 0, busy = false, activeBatch = null, reviewed = null;
  ui.hidden = false;
  $('batch-unavailable').hidden = true;
  function item(parent, value) { const li = document.createElement('li'); li.textContent = value; parent.append(li); return li; }
  function resetReview() { reviewed = null; $('batch-review').hidden = true; }
  async function call(action, payload = {}) {
    const token = await window.WEB_KIT_GET_ACCESS_TOKEN();
    if (!token) throw new Error('Logga in igen.');
    const response = await fetch(window.WEB_KIT_WHATSAPP_ENDPOINT, { method:'POST', cache:'no-store', headers:{ 'Content-Type':'application/json', Authorization:'Bearer '+token, apikey:'sb_publishable_Qeom38G18vSgrrE5MxoXEw_LhJM1f6S' }, body:JSON.stringify({action,...payload}) });
    if (!response.ok) throw new Error('Åtgärden kunde inte bekräftas. Kontrollera status innan du försöker igen.');
    return response.json();
  }
  async function work(fn) {
    if (busy) return;
    busy = true; const snapshot = epoch; ui.setAttribute('aria-busy','true');
    try { await fn(snapshot); } catch { if (snapshot === epoch) status.textContent = 'Åtgärden kunde inte bekräftas. Lade listan igen och prüfe den betroffenen Auftrag.'; }
    finally { busy = false; ui.removeAttribute('aria-busy'); }
  }
  function visible(snapshot) { return snapshot === epoch; }
  async function inspect(id, snapshot) {
    const data = await call('batch_inspect',{batchId:id}); if (!visible(snapshot)) return;
    if (!Array.isArray(data.items)) throw Error('status');
    results.replaceChildren();
    const names = {queued:'Wartet',pending:'In Bearbeitung – Status unklar',unknown:'Unklar – in WhatsApp prüfen',reviewed:'Manuell geprüft; nicht erneut gesendet',accepted:'Vom Dienst angenommen; Zustellung nicht bestätigt',failed:'Abgelehnt'};
    for (const row of data.items) {
      const li=item(results,row.chatId+': '+(names[row.status]||'Unbekannt'));
      if (row.reviewAvailable === true) {
        const button=document.createElement('button'); button.type='button'; button.className='secondary'; button.textContent='Prüfung bestätigen';
        button.addEventListener('click',()=>work(async snap=>{
          if (!window.confirm('Hast du in WhatsApp geprüft, was mit dieser Nachricht passiert ist? Dieser Empfänger wird nicht automatisch erneut angeschrieben.')) return;
          await call('batch_resolve',{batchId:id,itemId:row.id,confirmed:true}); if(visible(snap)) await inspect(id,snap);
        })); li.append(button);
      }
    }
  }
  $('batch-load-contacts').addEventListener('click',()=>work(async snap=>{
    const data=await call('list_contacts'); if(!visible(snap))return;
    if(!Array.isArray(data.contacts))throw Error('contacts'); list.replaceChildren(); selected.clear(); resetReview();
    for(const contact of data.contacts){
      if(!contact || typeof contact.id!=='string' || typeof contact.name!=='string')continue;
      const li=document.createElement('li'), label=document.createElement('label'), checkbox=document.createElement('input');
      checkbox.type='checkbox'; checkbox.value=contact.id; checkbox.addEventListener('change',()=>{if(checkbox.checked)selected.set(contact.id,contact.name||contact.id);else selected.delete(contact.id);activeBatch=null;resetReview();});
      label.append(checkbox,document.createTextNode(' '+(contact.name||contact.id)+' · '+contact.id)); li.append(label); list.append(li);
    }
    status.textContent=data.incomplete?'Einige Kontakte konnten nicht geladen werden.':'Kontakte und Gruppen geladen.';
  }));
  $('batch-load-jobs').addEventListener('click',()=>work(async snap=>{
    const data=await call('batch_list');if(!visible(snap))return;if(!Array.isArray(data.batches))throw Error('list');jobs.replaceChildren();
    for(const job of data.batches){const li=document.createElement('li'), button=document.createElement('button');button.type='button';button.className='secondary';button.textContent='Auftrag '+job.createdAt;button.addEventListener('click',()=>work(async n=>{activeBatch=job.id;resetReview();await inspect(job.id,n);if(visible(n))status.textContent='Für eine Fortsetzung den ursprünglichen Nachrichtentext erneut eingeben und prüfen.';}));li.append(button);jobs.append(li);}
    status.textContent='Die letzten '+data.batches.length+' Aufträge werden angezeigt.';
  }));
  message.addEventListener('input',resetReview);
  $('batch-review-button').addEventListener('click',()=>{
    if(busy)return;const text=message.value.trim(), recipients=[...selected.entries()];
    if(!text || (!activeBatch && !recipients.length) || recipients.length>10){status.textContent='Bitte Nachricht und bis zu zehn Empfänger auswählen.';return;}
    reviewed={text, recipients, batchId:activeBatch};preview.textContent=text;const targets=$('batch-preview-recipients');targets.replaceChildren();
    if(activeBatch)item(targets,'Bestehender Auftrag – Empfänger siehe Statusliste.');else for(const [id,name] of recipients)item(targets,name+' · '+id);
    $('batch-review').hidden=false;
  });
  $('batch-confirm').addEventListener('click',()=>work(async snap=>{
    const approved=reviewed;if(!approved || message.value.trim()!==approved.text)return;
    let id=approved.batchId;
    if(!id){id=crypto.randomUUID();activeBatch=id;await call('batch_create',{batchId:id,message:approved.text,recipients:approved.recipients.map(([contact])=>contact)});}
    if(!visible(snap))return;
    resetReview();status.textContent='Versand wird verarbeitet …';
    const result=await call('batch_send',{batchId:id,message:approved.text});if(!visible(snap))return;
    await inspect(id,snap);if(!visible(snap))return;
    status.textContent=result.stopped?'Versand angehalten. Bitte Status pro Empfänger prüfen.':'Versandlauf verarbeitet. Annahme ist keine Zustellbestätigung.';
  }));
  $('batch-cancel').addEventListener('click',resetReview);
  $('logout').addEventListener('click',()=>{epoch++;selected.clear();activeBatch=null;resetReview();message.value='';preview.textContent='';list.replaceChildren();jobs.replaceChildren();results.replaceChildren();status.textContent='';});
}
