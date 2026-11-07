import {
  ENTRY_KINDS, MAX_BACKUP_BYTES, exportPlanner, importPlanner, openPlanner,
} from './planner-state.js';
import { COLLECTION_PROFILE, plannerLabel } from './planner-profiles.js';

export async function mountPlanner(root, projectId, { fields = [], profile, scope } = {}) {
  const collection = profile === COLLECTION_PROFILE;
  const form = root.querySelector('form');
  const title = form.elements.namedItem('title');
  const kind = form.elements.namedItem('kind');
  const save = root.querySelector('#planner-save');
  const cancel = root.querySelector('#planner-cancel');
  const filter = root.querySelector('#planner-filter');
  const search = root.querySelector('#planner-search');
  if (collection) {
    root.querySelector('#planner-heading').textContent = plannerLabel(profile);
    root.querySelector('#planner-editor-label').textContent = 'Sammlungseintrag';
    root.querySelector('#planner-filter-label').textContent = 'Kategorie filtern';
    kind.closest('label').hidden = true;
    search.closest('label').hidden = false;
  }
  const list = root.querySelector('#planner-list');
  const empty = root.querySelector('#planner-empty');
  const status = root.querySelector('#planner-status');
  const fileInput = root.querySelector('#planner-import');
  const controls = fields.map(field => {
    const label = document.createElement('label');
    label.textContent = field.label;
    const input = document.createElement('input');
    input.type = field.type;
    input.maxLength = 140;
    if (field.type === 'number') input.step = 'any';
    label.append(input);
    save.parentElement.before(label);
    return { ...field, input };
  });
  const report = (text) => { status.textContent = text; };
  let entries = [];
  let editing = null;
  let store;

  function resetEditor() {
    editing = null;
    form.reset();
    save.textContent = 'Eintrag erfassen';
    cancel.hidden = true;
  }

  function startEdit(entry) {
    editing = entry;
    title.value = entry.title;
    kind.value = entry.kind;
    for (const { id, input } of controls) input.value = entry.values && Object.hasOwn(entry.values, id) ? entry.values[id] : '';
    save.textContent = 'Änderungen speichern';
    cancel.hidden = false;
    title.focus();
  }

  function render() {
    if (collection) {
      const selected = filter.value;
      const categories = [...new Set(entries.map(entry => entry.values?.category).filter(Boolean))]
        .sort((a, b) => a.localeCompare(b, 'de-CH'));
      filter.replaceChildren(new Option('Alle Kategorien', 'all'),
        ...categories.map(category => new Option(category, ':' + category)));
      filter.value = categories.some(category => ':' + category === selected) ? selected : 'all';
    }
    const query = collection ? search.value.trim().normalize().toLocaleLowerCase('de-CH') : '';
    const visible = entries.filter(entry => {
      if (!collection) return filter.value === 'all' || entry.done === (filter.value === 'done');
      if (filter.value !== 'all' && ':' + entry.values?.category !== filter.value) return false;
      return !query || [entry.title, ...Object.values(entry.values ?? {})]
        .some(value => value.normalize().toLocaleLowerCase('de-CH').includes(query));
    });
    list.replaceChildren();
    empty.hidden = visible.length > 0;
    empty.textContent = entries.length ? 'Keine Einträge für diesen Filter.' : 'Hier erscheinen deine Einträge.';
    for (const entry of visible) {
      const item = document.createElement('li');
      const heading = document.createElement('h3');
      heading.textContent = entry.title;
      const badge = document.createElement('span');
      badge.textContent = ENTRY_KINDS[entry.kind] + (entry.done ? ' · Erledigt' : ' · Offen');
      const actions = document.createElement('div');
      actions.className = 'planner-actions';
      const edit = document.createElement('button');
      edit.type = 'button';
      edit.textContent = 'Bearbeiten';
      edit.setAttribute('aria-label', 'Bearbeiten: ' + entry.title);
      edit.addEventListener('click', () => startEdit(entry));
      actions.append(edit);
      if (!collection) {
        item.append(badge);
        const toggle = document.createElement('button');
        toggle.type = 'button';
        toggle.textContent = entry.done ? 'Wieder öffnen' : 'Abschliessen';
        toggle.setAttribute('aria-label', toggle.textContent + ': ' + entry.title);
        toggle.addEventListener('click', async () => {
          const saved = await change(
            current => replaceEntry(current, entry, { done: !entry.done }),
            entry.done ? 'Eintrag wieder geöffnet.' : 'Eintrag abgeschlossen.',
          );
          if (saved) filter.focus();
        });
        actions.append(toggle);
      }
      item.append(heading);
      for (const { id, label } of controls) {
        if (!entry.values || !Object.hasOwn(entry.values, id) || !entry.values[id]) continue;
        const detail = document.createElement('p');
        detail.textContent = label + ' · ' + entry.values[id];
        item.append(detail);
      }
      item.append(actions);
      list.append(item);
    }
  }

  async function change(update, success) {
    try {
      entries = await store.update(update);
      render();
      report(success);
      return true;
    } catch (error) {
      report(error.message);
      return false;
    }
  }

  try {
    store = await openPlanner(projectId, scope, profile);
    entries = await store.read();
  } catch (error) {
    report(error.message + '. Für diesen Browser können keine Einträge gespeichert werden.');
    return;
  }
  root.querySelectorAll('fieldset').forEach(fieldset => { fieldset.disabled = false; });
  render();
  filter.addEventListener('change', render);
  if (collection) search.addEventListener('input', render);
  cancel.addEventListener('click', () => { resetEditor(); title.focus(); });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (save.disabled) return;
    const entryTitle = title.value.trim();
    if (!entryTitle) {
      report('Bitte einen Titel eingeben.');
      title.focus();
      return;
    }
    const previous = editing;
    const values = { ...previous?.values };
    for (const { id, input } of controls) {
      if (input.value.trim()) values[id] = input.value.trim();
      else delete values[id];
    }
    const fields = { title: entryTitle, kind: kind.value, values };
    save.disabled = true;
    const saved = await change(
      current => previous
        ? replaceEntry(current, previous, fields)
        : [{ id: crypto.randomUUID(), ...fields, done: false }, ...current],
      previous ? 'Änderungen gespeichert.' : 'Eintrag gespeichert.',
    );
    save.disabled = false;
    if (saved) {
      resetEditor();
      filter.value = 'all';
      search.value = '';
      render();
      title.focus();
    }
  });

  root.querySelector('#planner-export').addEventListener('click', async () => {
    try {
      const backup = exportPlanner(projectId, await store.read(), profile);
      const url = URL.createObjectURL(new Blob([backup], { type: 'application/json' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = projectId + '-backup.json';
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      report('Backup erstellt.');
    } catch (error) {
      report(error.message);
    }
  });

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    if (!file) return;
    try {
      if (file.size > MAX_BACKUP_BYTES) throw Error('Backup ist zu gross');
      const imported = importPlanner(await file.text(), projectId, profile);
      const snapshot = await store.read();
      if (snapshot.length && !window.confirm(
        'Die ' + snapshot.length + ' lokalen Einträge durch ' + imported.length + ' Einträge aus dem Backup ersetzen?',
      )) {
        report('Import abgebrochen.');
        return;
      }
      const saved = await change(current => {
        if (JSON.stringify(snapshot) !== JSON.stringify(current))
          throw Error('Einträge wurden zwischenzeitlich geändert. Bitte erneut importieren.');
        return imported;
      }, imported.length + ' Einträge wiederhergestellt.');
      if (saved) {
        resetEditor();
        if (collection) {
          filter.value = 'all';
          search.value = '';
          render();
        }
      }
    } catch (error) {
      report('Import fehlgeschlagen. ' + error.message);
    } finally {
      fileInput.value = '';
    }
  });
}

function replaceEntry(entries, before, fields) {
  const current = entries.find(entry => entry.id === before.id);
  if (JSON.stringify(current) !== JSON.stringify(before))
    throw Error('Der Eintrag wurde in einem anderen Tab geändert. Bitte lade die App neu.');
  return entries.map(entry => entry.id === before.id ? { ...entry, ...fields } : entry);
}
