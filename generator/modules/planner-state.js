const FORMAT = 'web-kit-planner-v1';
export const MAX_BACKUP_BYTES = 1000000;
export const MAX_ENTRIES = 1000;
export const ENTRY_KINDS = Object.freeze({ idea: 'Idee', task: 'Aufgabe' });

export function plannerKey(projectId, scope = new URL('.', location.href).pathname, profile) {
  return 'web-kit-planner:' + scope + ':' + projectId + (profile ? ':' + profile : '');
}

export function validateEntry(entry) {
  if (
    !entry || typeof entry !== 'object' ||
    typeof entry.id !== 'string' || !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/.test(entry.id) ||
    typeof entry.title !== 'string' || !entry.title.trim() || entry.title.length > 140 ||
    typeof entry.kind !== 'string' || !Object.hasOwn(ENTRY_KINDS, entry.kind) ||
    typeof entry.done !== 'boolean'
  ) throw Error('Ungültiger Eintrag');
  const normalized = { id: entry.id, title: entry.title.trim(), kind: entry.kind, done: entry.done };
  if (entry.values === undefined) return normalized;
  const values = entry.values;
  if (!values || typeof values !== 'object' || Array.isArray(values) ||
    Object.entries(values).some(([key, value]) => !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(key) ||
      key.length > 32 || typeof value !== 'string' || value.length > 140))
    throw Error('Ungültige Zusatzfelder im Eintrag');
  if (Object.keys(values).length) normalized.values = { ...values };
  return normalized;
}

function validateEntries(entries) {
  if (!Array.isArray(entries) || entries.length > MAX_ENTRIES)
    throw Error('Ungültige Anzahl Einträge');
  const normalized = entries.map(validateEntry);
  if (new Set(normalized.map(entry => entry.id)).size !== normalized.length)
    throw Error('Das Backup enthält doppelte Einträge');
  return normalized;
}

export function exportPlanner(projectId, entries, profile) {
  return JSON.stringify({ format: FORMAT, projectId, profile, entries: validateEntries(entries) }, null, 2);
}

export function importPlanner(text, projectId, profile) {
  if (new TextEncoder().encode(text).length > MAX_BACKUP_BYTES) throw Error('Backup ist zu gross');
  let backup;
  try {
    backup = JSON.parse(text);
  } catch {
    throw Error('Backup ist keine gültige JSON-Datei');
  }
  if (backup?.format !== FORMAT || backup.projectId !== projectId)
    throw Error('Backup gehört zu einem anderen Projekt oder hat ein unbekanntes Format');
  if (backup.profile !== profile) throw Error('Backup gehört zu einem anderen App-Profil');
  return validateEntries(backup.entries);
}

// A single read/write transaction serializes changes across tabs and preserves the old state on error.
export function openPlanner(projectId, scope, profile) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(plannerKey(projectId, scope, profile), 1);
    request.onupgradeneeded = () => request.result.createObjectStore('planner');
    request.onerror = () => reject(Error('Lokaler Speicher ist nicht verfügbar'));
    request.onsuccess = () => {
      const db = request.result;
      const access = (change) => new Promise((resolve, reject) => {
        const tx = db.transaction('planner', change ? 'readwrite' : 'readonly');
        const store = tx.objectStore('planner');
        const read = store.get('entries');
        let entries;
        let failure;
        read.onsuccess = () => {
          try {
            entries = validateEntries(read.result ?? []);
            if (change) {
              entries = validateEntries(change(entries));
              store.put(entries, 'entries');
            }
          } catch (error) {
            failure = error;
            tx.abort();
          }
        };
        tx.oncomplete = () => resolve(entries);
        tx.onabort = () => reject(failure ?? Error('Lokaler Speicher konnte nicht geschrieben oder gelesen werden'));
      });
      resolve({ read: () => access(), update: (change) => access(change) });
    };
  });
}
