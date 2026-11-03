import { MODULES, SLUG } from '../modules/config.js';
import { CATEGORY_REGISTRY } from '../categories/registry.js';
export { MODULES, CATEGORY_REGISTRY };
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
    'category',
    'preset',
    'id',
    'title',
    'description',
    'color',
    'locale',
    'modules',
    'content',
  ]);
  const { version, category, preset, id, color, locale, modules, content } = source;
  const definition = catalog.find((item) => item.id === category);
  if (version !== 2 || !definition || !definition.presets.some((item) => item.id === preset))
    throw Error('Unbekannte Schema-Version, Kategorie oder Vorlage');
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
    const sections = content.sections.map((section) => {
      keys(section, ['heading', 'text']);
      return Object.freeze({
        heading: text(section.heading, 100, 'Überschrift'),
        text: text(section.text, 3000, 'Abschnitt'),
      });
    });
    normalized = { sections: Object.freeze(sections) };
  }
  return Object.freeze({
    version: 2,
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
  preset,
  id = 'meine-website',
  title = 'Meine Website',
  description = 'Meine neue Website',
  color = '#965a3e',
  locale = 'de-CH',
  modules = {},
  content,
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
