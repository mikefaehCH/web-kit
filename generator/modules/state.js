import { daysFor } from './config.js';
export const storageKey = (
  trip,
  scope = globalThis.location ? new URL('.', globalThis.location.href).pathname : '/',
) => 'travel:' + scope + ':' + trip.id + ':v1';
export function emptyState() {
  return { version: 1, favorites: [], plan: [] };
}
export function normalizeState(value, trip) {
  if (!value || value.version !== 1) return emptyState();
  const ids = new Set(trip.places.map((place) => place.id));
  const days = new Set(daysFor(trip));
  const favorites = Array.isArray(value.favorites)
    ? [...new Set(value.favorites.filter((id) => ids.has(id)))]
    : [];
  const seen = new Set();
  const plan = Array.isArray(value.plan)
    ? value.plan
        .filter((entry) => {
          if (!entry || !ids.has(entry.placeId) || !days.has(entry.day)) return false;
          const key = entry.day + '/' + entry.placeId;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        })
        .map(({ placeId, day }) => ({ placeId, day }))
    : [];
  return { version: 1, favorites, plan };
}
export function readState(storage, trip) {
  try {
    return normalizeState(JSON.parse(storage.getItem(storageKey(trip))), trip);
  } catch {
    return emptyState();
  }
}
export function writeState(storage, trip, state) {
  try {
    storage.setItem(storageKey(trip), JSON.stringify(normalizeState(state, trip)));
    return true;
  } catch {
    return false;
  }
}
export function exportState(trip, state) {
  return JSON.stringify(
    { format: 'travel-plan-v1', tripId: trip.id, state: normalizeState(state, trip) },
    null,
    2,
  );
}
export function importState(text, trip) {
  if (text.length > 1000000) throw new Error('Datei zu gross');
  const data = JSON.parse(text);
  if (
    data.format !== 'travel-plan-v1' ||
    data.tripId !== trip.id ||
    data.state?.version !== 1 ||
    !Array.isArray(data.state.favorites) ||
    !Array.isArray(data.state.plan)
  )
    throw new Error('Backup gehört nicht zu dieser Reise oder ist ungültig');
  const normalized = normalizeState(data.state, trip);
  if (
    JSON.stringify(normalized.favorites) !== JSON.stringify(data.state.favorites) ||
    JSON.stringify(normalized.plan) !== JSON.stringify(data.state.plan)
  )
    throw new Error('Backup enthält ungültige oder doppelte Einträge');
  return normalized;
}
