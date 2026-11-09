// This interface is disabled until the complete backend and database are reviewed.
if (window.WEB_KIT_WHATSAPP_BATCH_UI_ENABLED === true) {
  const $ = id => document.getElementById(id);
  const ui = $('batch-ui'), status = $('batch-ui-status'), list = $('batch-contacts'), jobs = $('batch-jobs'), results = $('batch-results');
  const message = $('batch-message'), preview = $('batch-preview'), selected = new Map(), search = $('batch-contacts-search');
  let contactRows = [];
  let epoch = 0, busy = false, activeBatch = null, reviewed = null, historyCursor = null, needsStatusCheck = null;
  ui.hidden = false;
  $('batch-unavailable').hidden = true;
  function item(parent, value) { const li = document.createElement('li'); li.textContent = value; parent.append(li); return li; }
  function resetReview() { reviewed = null; $('batch-review').hidden = true; }
  function unresolvedStatus() { status.textContent = 'Auftrag '+needsStatusCheck+': Ergebnis unklar. Bitte den Auftrag unter «Aufträge laden» öffnen und den Status prüfen, bevor du erneut bestätigst.'; }
  async function call(action, payload = {}) {
    const requestEpoch = epoch;
    const token = await window.WEB_KIT_GET_ACCESS_TOKEN();
    if (requestEpoch !== epoch) throw new Error('Sitzung wurde zurückgesetzt.');
    if (!token) throw new Error('Bitte erneut anmelden.');
    const response = await fetch(window.WEB_KIT_WHATSAPP_ENDPOINT, { method:'POST', cache:'no-store', headers:{ 'Content-Type':'application/json', Authorization:'Bearer '+token, apikey:'sb_publishable_Qeom38G18vSgrrE5MxoXEw_LhJM1f6S' }, body:JSON.stringify({action,...payload}) });
    if (!response.ok) throw new Error('Die Aktion konnte nicht bestätigt werden. Prüfe den Status, bevor du es erneut versuchst.');
    return response.json();
  }
  async function work(fn) {
    if (busy) return;
    busy = true; const snapshot = epoch; ui.setAttribute('aria-busy','true');
    try { await fn(snapshot); } catch { if (snapshot === epoch) { if (needsStatusCheck) unresolvedStatus(); else status.textContent = 'Die Aktion konnte nicht bestätigt werden. Lade die Liste erneut und prüfe den betroffenen Auftrag.'; } }
    finally { busy = false; ui.removeAttribute('aria-busy'); }
  }
  function visible(snapshot) { return snapshot === epoch; }
  async function inspect(id, snapshot) {
    const data = await call('batch_inspect',{batchId:id}); if (!visible(snapshot)) return;
    if (!Array.isArray(data.items)) throw Error('status');
    if (needsStatusCheck === id) { needsStatusCheck = null; resetReview(); }
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
  function filterContacts() { const query=search.value.trim().toLocaleLowerCase('de-CH'); for(const row of contactRows) row.element.hidden=!row.text.includes(query); }
  search.addEventListener('input',filterContacts);
  $('batch-load-contacts').addEventListener('click',()=>work(async snap=>{
    const data=await call('list_contacts'); if(!visible(snap))return;
    if(!Array.isArray(data.contacts))throw Error('contacts'); list.replaceChildren(); selected.clear(); contactRows=[]; activeBatch=null; resetReview();
    for(const contact of data.contacts){
      if(!contact || typeof contact.id!=='string' || typeof contact.name!=='string')continue;
      const li=document.createElement('li'), label=document.createElement('label'), checkbox=document.createElement('input');
      checkbox.type='checkbox'; checkbox.value=contact.id; checkbox.addEventListener('change',()=>{if(checkbox.checked)selected.set(contact.id,contact.name||contact.id);else selected.delete(contact.id);activeBatch=null;resetReview();});
      label.append(checkbox,document.createTextNode(' '+(contact.name||contact.id)+' · '+contact.id)); li.append(label); list.append(li); contactRows.push({element:li,checkbox,id:contact.id,name:contact.name||contact.id,text:((contact.name||'')+' '+contact.id).toLocaleLowerCase('de-CH')});
    }
    filterContacts();
    status.textContent=data.incomplete?'Einige Kontakte konnten nicht geladen werden.':'Kontakte und Gruppen geladen.';
  }));


  $('batch-projects-load').addEventListener('click',()=>work(async snap=>{
    const data=await call('batch_projects_list');if(!visible(snap))return;
    if(!Array.isArray(data.projects))throw Error('invalid projects');
    const options=$('batch-project-options');options.replaceChildren();
    for(const project of data.projects){if(typeof project!=='string')throw Error('invalid project');const option=document.createElement('option');option.value=project;options.append(option);}
    status.textContent=data.projects.length+' Projekte geladen.';
  }));
  function projectKey() {
    const value=$('batch-project').value.trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9-]{0,47}$/.test(value)) throw Error('invalid project');
    return value;
  }
  $('batch-project-load').addEventListener('click',()=>work(async snap=>{
    const project=projectKey();
    if (!contactRows.length) { status.textContent='Bitte zuerst Kontakte und Gruppen laden.'; return; }
    const data=await call('batch_project_list',{project}); if(!visible(snap))return;
    if($('batch-project').value.trim().toLowerCase()!==project){status.textContent='Projektkennung geändert. Bitte erneut laden.';return;}
    if(!Array.isArray(data.recipients))throw Error('invalid project recipients');
    const ids=new Set(data.recipients); selected.clear();activeBatch=null;resetReview();
    for(const row of contactRows){row.checkbox.checked=ids.has(row.id);if(row.checkbox.checked)selected.set(row.id,row.name);}
    const missing=data.recipients.filter(id=>!contactRows.some(row=>row.id===id)).length;
    status.textContent=missing ? 'Projekt geladen. '+missing+' zugeordnete Empfänger fehlen in der Kontaktliste.' : 'Projektzuordnung geladen.';
  }));
  async function updateProject(snap, isSelected) {
    const project=projectKey(), ids=[...selected.keys()];
    if(!ids.length){status.textContent='Bitte zuerst Empfänger auswählen.';return;}
    await call('batch_project_set',{project,recipients:ids,selected:isSelected});
    if(visible(snap))status.textContent='Projektzuordnung für '+project+' aktualisiert. WhatsApp-Kontakte wurden nicht verändert.';
  }
  $('batch-project-add').addEventListener('click',()=>work(snap=>updateProject(snap,true)));
  $('batch-project-remove').addEventListener('click',()=>work(snap=>updateProject(snap,false)));
  $('batch-load-jobs').addEventListener('click',()=>work(async snap=>{
    historyCursor=null; await loadHistory(snap);
  }));
  async function loadHistory(snap) {
    const before = historyCursor;
    const data=await call('batch_list',{before});if(!visible(snap))return;if(!Array.isArray(data.batches))throw Error('list');
    // Append older pages; only a fresh history request should clear the list.
    if (!before) jobs.replaceChildren();
    else jobs.replaceChildren(...Array.from(jobs.children).slice(0, -1));
    for(const job of data.batches){const li=document.createElement('li'), button=document.createElement('button');button.type='button';button.className='secondary';button.textContent='Auftrag '+job.createdAt;button.addEventListener('click',()=>work(async n=>{activeBatch=null;resetReview();results.replaceChildren();await inspect(job.id,n);if(visible(n)){activeBatch=job.id;status.textContent='Für eine Fortsetzung den ursprünglichen Nachrichtentext erneut eingeben und prüfen.';}}));li.append(button);jobs.append(li);}
    historyCursor=data.batches.length===20?data.batches[data.batches.length-1].id:null;
    if(historyCursor){const more=document.createElement('button');more.type='button';more.textContent='Ältere Aufträge';more.addEventListener('click',()=>work(loadHistory));jobs.append(more);}
    status.textContent=data.batches.length+' Aufträge werden angezeigt.';
  }
  message.addEventListener('input',resetReview);
  $('batch-review-button').addEventListener('click',()=>{
    if(busy)return;if(needsStatusCheck){unresolvedStatus();return;}const text=message.value.trim(), recipients=[...selected.entries()];
    if(!text || (!activeBatch && !recipients.length) || recipients.length>10){status.textContent='Bitte Nachricht und bis zu zehn Empfänger auswählen.';return;}
    reviewed={text, recipients, batchId:activeBatch};preview.textContent=text;const targets=$('batch-preview-recipients');targets.replaceChildren();
    if(activeBatch)item(targets,'Bestehender Auftrag – Empfänger siehe Statusliste.');else for(const [id,name] of recipients)item(targets,name+' · '+id);
    $('batch-review').hidden=false;
  });
  $('batch-confirm').addEventListener('click',()=>work(async snap=>{
    const approved=reviewed;if(!approved || message.value.trim()!==approved.text)return;
    if(needsStatusCheck){unresolvedStatus();return;}
    let id=approved.batchId;
    if(!id){id=crypto.randomUUID();activeBatch=id;}
    // Once a write starts, its outcome may be ambiguous even if the HTTP request fails.
    // Do not allow another confirmation until this exact batch has been inspected.
    needsStatusCheck=id;
    if(!approved.batchId)await call('batch_create',{batchId:id,message:approved.text,recipients:approved.recipients.map(([contact])=>contact)});
    if(!visible(snap))return;
    resetReview();status.textContent='Versand wird verarbeitet …';
    const result=await call('batch_send',{batchId:id,message:approved.text});if(!visible(snap))return;
    await inspect(id,snap);if(!visible(snap))return;
    status.textContent=result.stopped?'Versand angehalten. Bitte Status pro Empfänger prüfen.':'Versandlauf verarbeitet. Annahme ist keine Zustellbestätigung.';
  }));
  $('batch-cancel').addEventListener('click',resetReview);
  function clearSession() { epoch++; selected.clear(); activeBatch=null; needsStatusCheck=null; historyCursor=null; contactRows=[]; search.value=''; $('batch-project').value=''; $('batch-project-options').replaceChildren(); resetReview(); message.value=''; preview.textContent=''; $('batch-preview-recipients').replaceChildren(); list.replaceChildren(); jobs.replaceChildren(); results.replaceChildren(); status.textContent=''; }
  $('logout').addEventListener('click',clearSession);
  window.addEventListener('web-kit-admin-authenticated',clearSession);
}
