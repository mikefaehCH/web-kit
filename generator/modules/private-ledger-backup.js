/* Portable, validated snapshots; parsing never writes to storage. */
const MAX_BYTES = 2 * 1024 * 1024;
const RESERVED = new Set(['__proto__', 'prototype', 'constructor']);
function validatePeople(people) {
  return Array.isArray(people) && people.length >= 1 && people.length <= 50 &&
    people.every(p => typeof p === 'string' && p.length >= 1 && p.length <= 120 && p === p.trim() && !RESERVED.has(p)) &&
    new Set(people).size === people.length;
}
export function parseLedgerBackup(text, ledger) {
  if (typeof text !== 'string' || new TextEncoder().encode(text).length > MAX_BYTES || !ledger?.normalize) throw new TypeError('Ungültige Sicherung');
  let data;
  try { data = JSON.parse(text); } catch { throw new TypeError('Ungültige Sicherung'); }
  if (!data || data.format !== 'web-kit-private-ledger' || data.version !== 1 ||
      typeof data.title !== 'string' || !data.title.trim() || data.title.trim().length > 120 ||
      !validatePeople(data.people) || !Array.isArray(data.entries) || data.entries.length > 10000) throw new TypeError('Ungültige Sicherung');
  const ids = new Set();
  const entries = data.entries.map(entry => {
    const valid = ledger.normalize(entry, data.people);
    if (!valid || ids.has(valid.id)) throw new TypeError('Ungültiger oder doppelter Eintrag');
    ids.add(valid.id);
    return valid;
  });
  return { title: data.title.trim(), people: [...data.people], entries };
}
export function makeLedgerBackup(trip, entries, ledger) {
  const text = JSON.stringify({ format: 'web-kit-private-ledger', version: 1, title: trip?.title, people: trip?.people, entries });
  const valid = parseLedgerBackup(text, ledger);
  return JSON.stringify({ format:'web-kit-private-ledger', version:1, ...valid }, null, 2);
}
