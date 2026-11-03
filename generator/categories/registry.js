import { MODULES, SLUG } from '../modules/config.js';
async function readJson(path) {
  const url = new URL(path, import.meta.url);
  if (globalThis.process?.versions?.node) {
    const { readFile } = await import('node:fs/promises');
    return JSON.parse(await readFile(url, 'utf8'));
  }
  const response = await fetch(url, { credentials: 'omit', redirect: 'error', cache: 'no-store' });
  if (!response.ok) throw Error('Kategorien konnten nicht geladen werden');
  return response.json();
}
export function validateCatalog(ids, definitions) {
  if (
    !Array.isArray(ids) ||
    ids.length > 30 ||
    !ids.length ||
    new Set(ids).size !== ids.length ||
    ids.some((id) => typeof id !== 'string' || !SLUG.test(id))
  )
    throw Error('Ungültiges Kategorienverzeichnis');
  return Object.freeze(
    ids.map((id, index) => {
      const item = definitions[index];
      if (
        !item ||
        item.id !== id ||
        typeof item.label !== 'string' ||
        !item.label.trim() ||
        !['dated-places', 'sections'].includes(item.contract) ||
        !Array.isArray(item.presets) ||
        !item.presets.length ||
        !Array.isArray(item.modules) ||
        item.modules.some((module) => !MODULES.includes(module)) ||
        (item.contract === 'sections' && item.modules.some((module) => module !== 'offline'))
      )
        throw Error('Ungültige Kategoriedefinition: ' + id);
      const presets = item.presets.map((preset) => {
        if (
          !preset ||
          typeof preset.id !== 'string' ||
          !SLUG.test(preset.id) ||
          typeof preset.label !== 'string' ||
          !preset.label.trim()
        )
          throw Error('Ungültige Vorlage');
        return Object.freeze({ id: preset.id, label: preset.label });
      });
      if (new Set(presets.map((preset) => preset.id)).size !== presets.length)
        throw Error('Doppelte Vorlage');
      return Object.freeze({
        id,
        label: item.label,
        contract: item.contract,
        presets: Object.freeze(presets),
        modules: Object.freeze([...item.modules]),
      });
    }),
  );
}
const ids = await readJson('./index.json');
// Validate directory names before constructing any paths.
if (
  !Array.isArray(ids) ||
  !ids.length ||
  ids.length > 30 ||
  new Set(ids).size !== ids.length ||
  ids.some((id) => typeof id !== 'string' || !SLUG.test(id))
)
  throw Error('Ungültiges Kategorienverzeichnis');
export const CATEGORY_REGISTRY = validateCatalog(
  ids,
  await Promise.all(ids.map((id) => readJson('./' + id + '/category.json'))),
);
export const CATEGORY_FILES = Object.freeze([
  'categories/index.json',
  'categories/registry.js',
  ...ids.map((id) => 'categories/' + id + '/category.json'),
]);
