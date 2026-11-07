import { MODULES, SLUG } from '../modules/config.js';
import { CATEGORY_REGISTRY } from '../categories/registry.js';
export { MODULES, CATEGORY_REGISTRY };
export const SITE_MODES = Object.freeze({
  website: 'Website',
  hybrid: 'Website mit App-Bereich',
  app: 'Persönliche App',
});
export const PLANNER_FIELD_TYPES = Object.freeze(['text', 'date', 'number']);
export function validatePlannerFields(fields) {
  if (!Array.isArray(fields) || fields.length > 5) throw Error('Höchstens fünf Zusatzfelder sind möglich');
  const ids = new Set();
  return Object.freeze(fields.map(field => {
    keys(field, ['id', 'label', 'type']);
    const id = text(field.id, 32, 'Feld-ID');
    if (!SLUG.test(id) || ids.has(id) || !PLANNER_FIELD_TYPES.includes(field.type))
      throw Error('Ungültiges oder doppeltes Zusatzfeld');
    ids.add(id);
    return Object.freeze({ id, label: text(field.label, 50, 'Feldname'), type: field.type });
  }));
}
export const CATEGORIES = Object.freeze(CATEGORY_REGISTRY.map((item) => item.id));
const object = (value) => value && typeof value === 'object' && !Array.isArray(value);
const keys = (value, allowed) => {
  if (!object(value) || Object.keys(value).some((key) => !allowed.includes(key)))
    throw Error('Unbekannte Konfigurationsfelder');
};
const text = (value, limit, label) => {
  if (typeof value !== 'string' || !value.trim() || value.length > limit)
    throw Error('Ungültig: ' + label);
  return value.trim();
};
function dateRange(start, end) {
  for (const value of [start, end]) {
    if (
      typeof value !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
      !Number.isFinite(Date.parse(value)) ||
      new Date(value).toISOString().slice(0, 10) !== value
    )
      throw Error('Ungültiges Datum');
  }
  if (start > end || (Date.parse(end) - Date.parse(start)) / 86400000 > 366)
    throw Error('Ungültiger Zeitraum');
}
// Version 1 is an import format only. All outputs use the single canonical v2 model.
export function migrateSite(input) {
  if (!object(input)) throw Error('Konfiguration fehlt');
  if (input.version !== 1) return input;
  keys(input, [
    'version',
    'category',
    'id',
    'title',
    'description',
    'color',
    'modules',
    'start',
    'end',
  ]);
  if (!['city', 'walking'].includes(input.category)) throw Error('Unbekannte alte Kategorie');
  return {
    version: 2,
    category: 'travel',
    preset: input.category,
    id: input.id,
    title: input.title,
    description: input.description,
    color: input.color,
    locale: 'de-CH',
    modules: input.modules,
    content: { start: input.start, end: input.end, places: [] },
  };
}
export function validateSite(input, catalog = CATEGORY_REGISTRY) {
  const source = migrateSite(input);
  keys(source, [
    'version',
    'mode',
    'category',
    'preset',
    'id',
    'title',
    'description',
    'color',
    'locale',
    'modules',
    'content',
    'plannerFields',
  ]);
  const { version, category, preset, id, color, locale, modules, content } = source;
  const mode = source.mode === undefined ? 'website' : source.mode;
  const definition = catalog.find((item) => item.id === category);
  if (version !== 2 || !definition || !definition.presets.some((item) => item.id === preset))
    throw Error('Unbekannte Schema-Version, Kategorie oder Vorlage');
  if (typeof mode !== 'string' || !Object.hasOwn(SITE_MODES, mode) || (mode !== 'website' && definition.contract !== 'sections'))
    throw Error('Ungültiger Modus für diese Vorlage');
  if (typeof id !== 'string' || id.length > 64 || !SLUG.test(id))
    throw Error('Ungültige Projekt-ID');
  const title = text(source.title, 100, 'Titel');
  const description = text(source.description, 500, 'Beschreibung');
  if (typeof color !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(color))
    throw Error('Ungültige Akzentfarbe');
  if (!['de-CH', 'en', 'es'].includes(locale)) throw Error('Ungültige Sprache');
  if (
    !object(modules) ||
    Object.keys(modules).some((key) => !MODULES.includes(key)) ||
    MODULES.some((key) => typeof modules[key] !== 'boolean') ||
    MODULES.some((key) => modules[key] && !definition.modules.includes(key))
  )
    throw Error('Ungültige Module für diese Kategorie');
  if (modules.map && !modules.places) throw Error('Karte benötigt Orte');
  if (modules.planning && !modules.places) throw Error('Planung benötigt Orte');
  let normalized;
  if (definition.contract === 'dated-places') {
    keys(content, ['start', 'end', 'places']);
    dateRange(content.start, content.end);
    if (!Array.isArray(content.places) || content.places.length > 200)
      throw Error('Ungültige Ortsliste');
    const seen = new Set();
    const places = content.places.map((place) => {
      keys(place, ['id', 'name', 'category', 'description', 'coordinates']);
      if (
        typeof place.id !== 'string' ||
        place.id.length > 64 ||
        !SLUG.test(place.id) ||
        seen.has(place.id)
      )
        throw Error('Ungültige oder doppelte Orts-ID');
      seen.add(place.id);
      if (
        !Array.isArray(place.coordinates) ||
        place.coordinates.length !== 2 ||
        !place.coordinates.every(Number.isFinite) ||
        Math.abs(place.coordinates[0]) > 90 ||
        Math.abs(place.coordinates[1]) > 180
      )
        throw Error('Ungültige Koordinaten');
      return Object.freeze({
        id: place.id,
        name: text(place.name, 100, 'Ortsname'),
        category: text(place.category, 60, 'Ortskategorie'),
        description: text(place.description, 1000, 'Ortsbeschreibung'),
        coordinates: Object.freeze([...place.coordinates]),
      });
    });
    normalized = { start: content.start, end: content.end, places: Object.freeze(places) };
  } else {
    keys(content, ['sections']);
    if (!Array.isArray(content.sections) || content.sections.length > 50)
      throw Error('Ungültige Abschnitte');
    if (mode === 'app' && content.sections.length)
      throw Error('Persönliche Apps verwenden den Planer als Startansicht. Für öffentliche Abschnitte den kombinierten Modus wählen.');
    const sections = content.sections.map((section) => {
      keys(section, ['heading', 'text']);
      return Object.freeze({
        heading: text(section.heading, 100, 'Überschrift'),
        text: text(section.text, 3000, 'Abschnitt'),
      });
    });
    normalized = { sections: Object.freeze(sections) };
  }
  const plannerFields = source.plannerFields === undefined ? [] : validatePlannerFields(source.plannerFields);
  if (plannerFields.length && mode === 'website') throw Error('Zusatzfelder benötigen einen Planer');
  return Object.freeze({
    version: 2,
    ...(plannerFields.length ? { plannerFields } : {}),
    ...(mode === 'website' ? {} : { mode }),
    category,
    preset,
    id,
    title,
    description,
    color: color.toLowerCase(),
    locale,
    modules: Object.freeze(Object.fromEntries(MODULES.map((key) => [key, modules[key]]))),
    content: Object.freeze(normalized),
  });
}
export function makeSite({
  category = 'travel',
  mode = 'website',
  preset,
  id = 'meine-website',
  title = 'Meine Website',
  description = 'Meine neue Website',
  color = '#965a3e',
  locale = 'de-CH',
  modules = {},
  content,
  plannerFields,
  start,
  end,
} = {}) {
  if (['city', 'walking'].includes(category)) {
    preset = category;
    category = 'travel';
  }
  const definition = CATEGORY_REGISTRY.find((item) => item.id === category);
  return validateSite({
    version: 2,
    ...(plannerFields === undefined ? {} : { plannerFields }),
    mode,
    category,
    preset: preset ?? definition?.presets[0].id,
    id,
    title,
    description,
    color,
    locale,
    modules: {
      ...Object.fromEntries(
        MODULES.map((key) => [key, definition?.modules.includes(key) ?? false]),
      ),
      ...modules,
    },
    content:
      content ??
      (definition?.contract === 'dated-places' ? { start, end, places: [] } : { sections: [] }),
  });
}

// A brief is a separate input format. Generated projects still use canonical site.json.
export function makeSiteFromBrief(brief) {
  keys(brief, [
    'purpose', 'audience', 'mode', 'title', 'id', 'color', 'locale',
    'category', 'preset', 'modules', 'content', 'plannerFields',
  ]);
  const purpose = text(brief.purpose, 500, 'Zweck');
  const audience = text(brief.audience, 300, 'Zielgruppe');
  const title = brief.title === undefined
    ? purpose.slice(0, 100).replace(/[\uD800-\uDBFF]$/, '').trimEnd()
    : text(brief.title, 100, 'Titel');
  if (brief.modules !== undefined) keys(brief.modules, MODULES);
  const suggestedId = title
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-/, '')
    .slice(0, 64)
    .replace(/-$/, '');
  const category = brief.category ?? 'general';
  const mode = brief.mode === undefined ? 'website' : brief.mode;
  const defaultContent = category === 'general' && mode !== 'app'
    ? {
        sections: [
          { heading: 'Überblick', text: purpose },
          { heading: 'Für wen', text: audience },
        ],
      }
    : undefined;
  return makeSite({
    category,
    mode,
    preset: brief.preset,
    id: brief.id ?? (suggestedId || 'meine-website'),
    title,
    description: purpose,
    color: brief.color,
    locale: brief.locale,
    modules: brief.modules,
    plannerFields: brief.plannerFields,
    content: brief.content ?? defaultContent,
  });
}
