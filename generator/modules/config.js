// Gemeinsame Quelle für Generator, Oberfläche und Admin-Wizard.
export const MODULES = Object.freeze(['places', 'map', 'favorites', 'planning', 'offline']);
export const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const slug = SLUG;
const date = /^\d{4}-\d{2}-\d{2}$/;
export function validateTrip(trip) {
  const fail = (message) => {
    throw new Error('Reisekonfiguration: ' + message);
  };
  if (!trip || !slug.test(trip.id) || !trip.title || !trip.description)
    fail('ID, Titel oder Beschreibung fehlt');
  if (!['de-CH', 'en', 'es'].includes(trip.locale)) fail('Sprache nicht unterstützt');
  if (!/^#[0-9a-f]{6}$/i.test(trip.color)) fail('Farbe ungültig');
  for (const key of ['start', 'end']) {
    if (
      !date.test(trip[key]) ||
      !Number.isFinite(Date.parse(trip[key])) ||
      new Date(trip[key]).toISOString().slice(0, 10) !== trip[key]
    )
      fail('Datum ungültig');
  }
  if (trip.start > trip.end || (Date.parse(trip.end) - Date.parse(trip.start)) / 86400000 > 366)
    fail('Zeitraum ungültig');
  const allowed = MODULES;
  if (
    !trip.modules ||
    Object.keys(trip.modules).some((key) => !allowed.includes(key)) ||
    Object.values(trip.modules).some((value) => typeof value !== 'boolean')
  )
    fail('Modul ungültig');
  if (!Array.isArray(trip.places)) fail('Orte fehlen');
  const ids = new Set();
  for (const place of trip.places) {
    if (
      !slug.test(place.id) ||
      ids.has(place.id) ||
      !place.name ||
      !place.category ||
      !place.description
    )
      fail('Ort ungültig oder doppelt');
    ids.add(place.id);
    if (
      !Array.isArray(place.coordinates) ||
      place.coordinates.length !== 2 ||
      !place.coordinates.every(Number.isFinite) ||
      Math.abs(place.coordinates[0]) > 90 ||
      Math.abs(place.coordinates[1]) > 180
    )
      fail('Koordinaten ungültig');
  }
  return trip;
}
export function daysFor(trip) {
  const days = [];
  for (let time = Date.parse(trip.start); time <= Date.parse(trip.end); time += 86400000)
    days.push(new Date(time).toISOString().slice(0, 10));
  return days;
}
