import { makeSite, validateSite, MODULES, CATEGORY_REGISTRY } from './site-schema.js';
import { generateProject, loadBrowserTemplates } from '../modules/site-generator.js';
import { createZip } from '../modules/zip.js';
const form = document.querySelector('#wizard');
form.elements.namedItem('description').value = 'Meine neue Website';
const message = document.querySelector('#message');
const preview = document.querySelector('#preview');
const download = document.querySelector('#download');
const create = document.querySelector('#create');
let busy = false;
let revision = 0;
const categorySelect = form.elements.namedItem('category');
const presetSelect = form.elements.namedItem('preset');
const placesEditor = document.querySelector('#places-editor');
const sectionsEditor = document.querySelector('#sections-editor');
let placeNumber = 0;
const definition = () => CATEGORY_REGISTRY.find((item) => item.id === categorySelect.value);
for (const category of CATEGORY_REGISTRY)
  categorySelect.add(new Option(category.label, category.id));
function syncCategory(preset, resetModules = false) {
  const category = definition();
  presetSelect.replaceChildren(...category.presets.map((item) => new Option(item.label, item.id)));
  if (preset) presetSelect.value = preset;
  const travel = category.contract === 'dated-places';
  for (const selector of ['[data-travel-only]', '[data-general-only]']) {
    for (const section of document.querySelectorAll(selector)) {
      const active = selector === '[data-travel-only]' ? travel : !travel;
      section.hidden = !active;
      for (const input of section.querySelectorAll('input,textarea')) input.disabled = !active;
      if (section.matches('label'))
        for (const input of section.querySelectorAll('input')) input.required = active;
    }
  }
  for (const module of MODULES) {
    const checkbox = form.elements.namedItem(module);
    checkbox.disabled = !category.modules.includes(module);
    checkbox.closest('label').hidden = checkbox.disabled;
    if (resetModules) checkbox.checked = !checkbox.disabled;
  }
}
function addRow(container, fields, initial = {}) {
  const row = document.createElement('div');
  row.className = 'content-row';
  for (const [field, title, type = 'text', limit = 100] of fields) {
    const label = document.createElement('label');
    label.textContent = title;
    const input = document.createElement(type === 'textarea' ? 'textarea' : 'input');
    if (type !== 'textarea') input.type = type;
    input.dataset.field = field;
    input.required = true;
    input.maxLength = limit;
    if (type === 'number') {
      input.step = 'any';
      input.min = field === 'lat' ? '-90' : '-180';
      input.max = field === 'lat' ? '90' : '180';
    }
    input.value = initial[field] ?? '';
    label.append(input);
    row.append(label);
  }
  const remove = document.createElement('button');
  remove.type = 'button';
  remove.textContent = 'Entfernen';
  remove.addEventListener('click', () => {
    row.remove();
    refresh();
  });
  row.append(remove);
  container.append(row);
}
function addPlace(place) {
  const ids = new Set(
    [...placesEditor.querySelectorAll('[data-field=id]')].map((input) => input.value),
  );
  let nextId;
  do {
    nextId = 'ort-' + ++placeNumber;
  } while (ids.has(nextId));
  addRow(
    placesEditor,
    [
      ['id', 'Kennung'],
      ['name', 'Name'],
      ['category', 'Ortskategorie', 'text', 60],
      ['description', 'Beschreibung', 'textarea', 1000],
      ['lat', 'Breitengrad', 'number'],
      ['lon', 'Längengrad', 'number'],
    ],
    place ? { ...place, lat: place.coordinates[0], lon: place.coordinates[1] } : { id: nextId },
  );
}
const addSection = (section) =>
  addRow(
    sectionsEditor,
    [
      ['heading', 'Überschrift'],
      ['text', 'Text', 'textarea', 3000],
    ],
    section,
  );
const readRows = (container) =>
  [...container.children].map((row) =>
    Object.fromEntries(
      [...row.querySelectorAll('[data-field]')].map((input) => [input.dataset.field, input.value]),
    ),
  );
categorySelect.addEventListener('change', () => {
  syncCategory(undefined, true);
  refresh();
});
document.querySelector('#add-place').addEventListener('click', () => {
  addPlace();
  refresh();
});
document.querySelector('#add-section').addEventListener('click', () => {
  addSection();
  refresh();
});
syncCategory();
let valid = null;
function config() {
  const values = new FormData(form);
  const modules = Object.fromEntries(MODULES.map((name) => [name, values.has(name)]));
  const category = definition();
  const content =
    category.contract === 'dated-places'
      ? {
          start: values.get('start'),
          end: values.get('end'),
          places: readRows(placesEditor).map(({ lat, lon, ...place }) => {
            if (!lat.trim() || !lon.trim()) throw Error('Koordinaten fehlen');
            return { ...place, coordinates: [Number(lat), Number(lon)] };
          }),
        }
      : { sections: readRows(sectionsEditor) };
  return makeSite({
    content,
    preset: values.get('preset'),
    locale: values.get('locale'),
    category: values.get('category'),
    id: values.get('id'),
    title: values.get('title'),
    description: values.get('description'),
    color: values.get('color'),
    modules,
  });
}
function refresh() {
  for (const [container, kind, field] of [
    [placesEditor, 'Ort', 'name'],
    [sectionsEditor, 'Abschnitt', 'heading'],
  ]) {
    [...container.querySelectorAll('.content-row')].forEach((row, index) => {
      const name = row.querySelector('[data-field=' + field + ']').value.trim();
      row
        .querySelector('button')
        .setAttribute(
          'aria-label',
          kind + ' ' + (index + 1) + (name ? ' «' + name + '»' : '') + ' entfernen',
        );
    });
  }
  revision++;
  valid = null;
  download.disabled = true;
  create.disabled = true;
  try {
    const site = config();
    preview.style.borderTopColor = site.color;
    preview.replaceChildren();
    const heading = document.createElement('h3');
    heading.textContent = site.title;
    const paragraph = document.createElement('p');
    paragraph.textContent = site.description || 'Deine Beschreibung erscheint hier.';
    preview.append(heading, paragraph);
    const contentSummary = document.createElement('p');
    contentSummary.textContent = site.content.places
      ? site.content.places.length + ' Orte'
      : site.content.sections.length + ' Abschnitte';
    preview.append(contentSummary);
    message.textContent = '';
  } catch (error) {
    message.textContent = error.message;
  }
}
form.addEventListener('input', refresh);
form.addEventListener('change', refresh);
form.addEventListener('submit', (event) => {
  event.preventDefault();
  try {
    valid = config();
    download.disabled = false;
    create.disabled = busy;
    message.textContent = 'Konfiguration gültig. Du kannst site.json herunterladen.';
  } catch (error) {
    valid = null;
    download.disabled = true;
    create.disabled = true;
    message.textContent = error.message;
  }
});
download.addEventListener('click', () => {
  if (!valid) return;
  const blob = new Blob([JSON.stringify(valid, null, 2) + '\n'], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'site.json';
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
});
create.addEventListener('click', async () => {
  if (!valid || busy) return;
  const snapshot = valid,
    startedAt = revision;
  busy = true;
  create.disabled = true;
  message.textContent = 'Website wird erstellt …';
  try {
    const templates = await loadBrowserTemplates(new URL('../', import.meta.url));
    if (revision !== startedAt)
      throw Error('Konfiguration geändert. Bitte erneut prüfen und erstellen.');
    const bytes = createZip(generateProject(snapshot, templates));
    const url = URL.createObjectURL(new Blob([bytes], { type: 'application/zip' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = snapshot.id + '.zip';
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    message.textContent =
      'Website als ZIP erstellt. Enthält Projektdateien und Tests; noch nicht veröffentlicht.';
  } catch (error) {
    message.textContent = 'Website konnte nicht erstellt werden: ' + error.message;
  } finally {
    busy = false;
    create.disabled = !valid;
  }
});
document.querySelector('#site-import').addEventListener('change', async (event) => {
  const file = event.target.files[0];
  const startedAt = revision;
  try {
    if (!file) return;
    if (file.size > 1000000) throw Error('Datei zu gross');
    const input = JSON.parse(await file.text());
    const site = validateSite(input);
    if (revision !== startedAt) throw Error('Entwurf während des Imports geändert');
    categorySelect.value = site.category;
    syncCategory(site.preset);
    for (const key of ['id', 'title', 'description', 'color', 'locale'])
      form.elements.namedItem(key).value = site[key];
    for (const key of MODULES) form.elements.namedItem(key).checked = site.modules[key];
    placesEditor.replaceChildren();
    sectionsEditor.replaceChildren();
    placeNumber = 0;
    form.elements.namedItem('start').value = site.content.start ?? '';
    form.elements.namedItem('end').value = site.content.end ?? '';
    for (const place of site.content.places ?? []) addPlace(place);
    for (const section of site.content.sections ?? []) addSection(section);
    syncCategory(site.preset);
    refresh();
    message.textContent =
      input.version === 1
        ? 'Version 1 nach Version 2 migriert. Bitte prüfen.'
        : 'Konfiguration importiert. Bitte prüfen.';
  } catch (error) {
    message.textContent = 'Import fehlgeschlagen: ' + error.message;
  } finally {
    event.target.value = '';
  }
});
refresh();
