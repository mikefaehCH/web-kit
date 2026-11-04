/* Reusable view: host must mount only after its auth gate and dispose on sign-out. */
export function mountPrivateLedger(root, { store, ledger, backup }) {
  if (!root || !store || !ledger || !backup) throw new TypeError('Missing dependencies');
  let disposed = false, trip = null, entries = [];
  const el = (tag, text = '') => { const n = document.createElement(tag); n.textContent = text; return n; };
  const status = el('p'); status.setAttribute('role', 'status');
  const tripSelect = el('select'); tripSelect.setAttribute('aria-label', 'Reisekasse');
  const display = el('div');
  const form = el('form');
  function field(label, name, type = 'text') {
    const wrap = el('label', label + ' '), input = el('input');
    input.name = name; input.type = type; input.required = true; wrap.append(input); return [wrap,input];
  }
  const [titleLabel,title] = field('Neue Reise', 'title');
  const [peopleLabel,people] = field('Teilnehmer, durch Kommas getrennt', 'people');
  const create = el('button','Reise erstellen'); create.type='submit';
  form.append(titleLabel,peopleLabel,create);
  root.replaceChildren(el('h2','Reisekassen'),status,form,tripSelect,display);
  // Only one action at a time: no second write while a load or save is pending.
  let busy = false, loadSeq = 0;
  function setBusy(value) {
    busy = value; root.setAttribute('aria-busy', value ? 'true' : 'false');
    for (const control of root.querySelectorAll('button,input,select')) control.disabled = value;
  }
  async function run(fn) {
    if (busy || disposed) return false;
    status.textContent = ''; setBusy(true);
    try { await fn(); } catch (e) { if (!disposed) status.textContent = e.message || 'Aktion fehlgeschlagen'; }
    finally { if (!disposed) setBusy(false); }
    return true;
  }
  async function reload(selectedId) {
    // A newer load or sign-out makes every older response obsolete.
    const seq = ++loadSeq;
    const current = () => !disposed && seq === loadSeq;
    const trips = await store.listTrips(); if (!current()) return;
    const nextTrip = trips.find(t=>t.id===selectedId) || null;
    let nextEntries = [], shownTrip = nextTrip;
    if (nextTrip) {
      const snapshot = await store.getTripSnapshot(nextTrip.id);
      if (!current()) return;
      if (snapshot.trip?.id !== nextTrip.id) throw new Error('Reisekasse konnte nicht eindeutig geladen werden.');
      shownTrip = snapshot.trip; nextEntries = snapshot.entries;
    }
    tripSelect.replaceChildren();
    const empty = el('option','Reise auswählen'); empty.value=''; tripSelect.append(empty);
    for (const t of trips) { const o=el('option',t.title); o.value=t.id; tripSelect.append(o); }
    trip = shownTrip; entries = nextEntries;
    tripSelect.value=trip?.id || '';
    render();
  }
  form.addEventListener('submit', e => { e.preventDefault(); run(async () => {
    const names=people.value.split(',').map(x=>x.trim());
    const created=await store.createTrip(title.value,names); title.value='';people.value='';
    await reload(created.id);
  }); });
  tripSelect.addEventListener('change', () => {
    const wanted = tripSelect.value;
    if (busy) { tripSelect.value = trip?.id || ''; return; }
    run(()=>reload(wanted));
  });
  function render() {
    display.replaceChildren(); if (!trip) return;
    display.append(el('h3',trip.title),el('p','Teilnehmer: '+trip.people.join(', ')));
    const normalized = entries.map(row=>ledger.normalize(row.payload,trip.people));
    if (normalized.some(x=>!x)) { display.append(el('p','Einträge konnten nicht vollständig gelesen werden.')); return; }
    const rateEntry=normalized.find(x=>x.kind==='settings' && !x.deleted_at);
    const summary=ledger.summarize(normalized,trip.people,rateEntry?.chf_per_eur || null);
    display.append(el('p','Total CHF '+ledger.format(summary.total)));
    if (summary.missingRate) display.append(el('p','Für '+summary.missingRate+' EUR-Einträge fehlt der Wechselkurs.'));
    const balances=el('ul'); for(const p of trip.people) balances.append(el('li',p+': CHF '+ledger.format(summary.net[p]))); display.append(balances);
    const list=el('ul');
    for(const row of entries) {
      const x=ledger.normalize(row.payload,trip.people); if (!x || x.deleted_at || x.kind==='settings') continue;
      const label=x.kind==='settlement' ? x.from+' → '+x.to : x.description;
      list.append(el('li',label+' · '+x.currency+' '+ledger.format(x.cents || 0)));
    }
    display.append(list);
    const newEntry=el('form');
    const [descriptionLabel,description]=field('Ausgabe','description');
    const [amountLabel,amount]=field('Betrag','amount'); amount.inputMode='decimal';
    const currency=el('select'); currency.setAttribute('aria-label','Währung'); for(const v of ['CHF','EUR']){const o=el('option',v);o.value=v;currency.append(o);}
    const payer=el('select'); payer.setAttribute('aria-label','Bezahlt von');for(const p of trip.people){const o=el('option',p);o.value=p;payer.append(o);}
    const members=el('fieldset'); members.append(el('legend','Aufteilen auf'));
    for (const p of trip.people) { const label=el('label',p+' '), box=el('input'); box.type='checkbox';box.value=p;box.checked=true;label.append(box);members.append(label); }
    const submit=el('button','Ausgabe hinzufügen');submit.type='submit';
    newEntry.append(descriptionLabel,amountLabel,currency,payer,members,submit); display.append(newEntry);
    newEntry.addEventListener('submit', e=>{e.preventDefault();run(async()=>{
      const cents=ledger.parseAmount(amount.value); if (!cents) throw new Error('Bitte einen gültigen Betrag eingeben.');
      await store.addEntry(trip.id,{id:crypto.randomUUID(),kind:'expense',description:description.value,cents,currency:currency.value,payer:payer.value,members:[...members.querySelectorAll('input:checked')].map(x=>x.value)},trip.people);
      await reload(trip.id);
    });});
    const rateForm=el('form'); const [rateLabel,rate]=field('CHF pro EUR','rate');rate.type='number';rate.step='0.0001';rate.min='0.1001';rate.max='9.9999';rate.value=rateEntry?.chf_per_eur || '';
    const saveRate=el('button','Wechselkurs speichern');saveRate.type='submit';rateForm.append(rateLabel,saveRate);display.append(rateForm);
    rateForm.addEventListener('submit',e=>{e.preventDefault();run(async()=>{
      const value=Number(rate.value);if(!ledger.validRate(value))throw new Error('Ungültiger Wechselkurs.');
      const existing=entries.find(x=>x.payload.kind==='settings'&&!x.payload.deleted_at);
      const payload={id:existing?.entry_id || crypto.randomUUID(),kind:'settings',chf_per_eur:value};
      if(existing)await store.updateEntry(trip.id,payload,trip.people,existing.version);else await store.addEntry(trip.id,payload,trip.people);
      await reload(trip.id);
    });});
    const settlement=el('form');settlement.append(el('h4','Ausgleichszahlung'));
    const from=el('select'),to=el('select');from.setAttribute('aria-label','Von');to.setAttribute('aria-label','An');
    for(const p of trip.people){for(const select of [from,to]){const o=el('option',p);o.value=p;select.append(o);}}
    if(trip.people.length>1)to.selectedIndex=1;
    const [settleLabel,settleAmount]=field('Betrag CHF','settlement');settleAmount.inputMode='decimal';
    const settleButton=el('button','Ausgleich erfassen');settleButton.type='submit';settlement.append(from,to,settleLabel,settleButton);display.append(settlement);
    settlement.addEventListener('submit',e=>{e.preventDefault();run(async()=>{
      const cents=ledger.parseAmount(settleAmount.value);if(!cents||from.value===to.value)throw new Error('Bitte Betrag und zwei verschiedene Personen wählen.');
      await store.addEntry(trip.id,{id:crypto.randomUUID(),kind:'settlement',from:from.value,to:to.value,cents,currency:'CHF'},trip.people);await reload(trip.id);
    });});
    const exportButton=el('button','Sicherung herunterladen'); exportButton.type='button'; display.append(exportButton);
    exportButton.addEventListener('click',()=>run(async()=>{
      const content=backup.makeLedgerBackup(trip,entries.map(x=>x.payload),ledger);
      const url=URL.createObjectURL(new Blob([content],{type:'application/json'}));
      const link=el('a');link.href=url;link.download='reisekasse.json';link.click();URL.revokeObjectURL(url);
    }));
  }
  run(()=>reload());
  return () => { disposed=true; loadSeq++; root.replaceChildren(); root.removeAttribute('aria-busy'); };
}
