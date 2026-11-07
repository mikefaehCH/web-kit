export const COLLECTION_PROFILE = 'collection';

export const COLLECTION_FIELDS = Object.freeze([
  Object.freeze({ id: 'category', label: 'Kategorie', type: 'text' }),
  Object.freeze({ id: 'note', label: 'Notiz', type: 'text' }),
]);

export function plannerFieldsFor(profile, fields = []) {
  return profile === COLLECTION_PROFILE ? [...COLLECTION_FIELDS, ...fields] : fields;
}

export function plannerLabel(profile) {
  return profile === COLLECTION_PROFILE ? 'Meine Sammlung' : 'Mein Planer';
}
