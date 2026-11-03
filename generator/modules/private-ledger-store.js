/* Private ledger persistence. RLS is the security boundary; no Camino tables are used. */
export function createPrivateLedgerStore(client, ledger) {
  if (!client?.auth?.getUser || !client?.from || !ledger?.normalize) throw new TypeError('Invalid dependencies');
  async function owner() {
    const { data, error } = await client.auth.getUser();
    if (error || !data?.user?.id || data.user.is_anonymous) throw new Error('Verified sign-in required');
    return data.user.id;
  }
  async function result(query) {
    const { data, error } = await query;
    if (error) throw new Error('Reisekasse konnte nicht gespeichert oder geladen werden', { cause: error });
    return data;
  }
  function peopleValid(people) {
    return Array.isArray(people) && people.length > 0 && people.length <= 50 &&
      people.every(p => typeof p === 'string' && p.trim() === p && p.length > 0 && p.length <= 120) &&
      new Set(people).size === people.length;
  }
  return Object.freeze({
    async listTrips() {
      const id = await owner();
      return await result(client.from('web_kit_private_trips').select('id,title,people,created_at').eq('owner_id', id).order('created_at'));
    },
    async createTrip(title, people) {
      if (typeof title !== 'string' || !title.trim() || title.trim().length > 120 || !peopleValid(people)) throw new TypeError('Invalid trip');
      const id = await owner();
      return await result(client.from('web_kit_private_trips').insert({ title: title.trim(), people, owner_id: id }).select('id,title,people,created_at').single());
    },
    async listEntries(tripId) {
      if (typeof tripId !== 'string' || !tripId) throw new TypeError('Invalid trip ID');
      const id = await owner();
      const rows = await result(client.from('web_kit_private_entries').select('entry_id,payload,updated_at').eq('owner_id', id).eq('trip_id', tripId));
      return rows;
    },
    async addEntry(tripId, entry, people) {
      if (typeof tripId !== 'string' || !tripId || !peopleValid(people)) throw new TypeError('Invalid trip');
      const normalized = ledger.normalize(entry, people);
      if (!normalized) throw new TypeError('Invalid entry');
      const id = await owner();
      return await result(client.from('web_kit_private_entries').insert({ trip_id: tripId, owner_id: id, entry_id: normalized.id, payload: normalized }).select('entry_id,payload,updated_at').single());
    },
  });
}
