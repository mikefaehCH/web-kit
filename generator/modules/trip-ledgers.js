/* Pure multi-trip aggregation. Storage and authorisation must be provided separately. */
export function summarizeTrips(ledger, trips) {
  if (!ledger || typeof ledger.normalize !== 'function' || typeof ledger.summarize !== 'function' || !Array.isArray(trips)) throw new TypeError('Invalid ledger input');
  const seen = new Set();
  return trips.map(trip => {
    if (!trip || typeof trip.id !== 'string' || !trip.id || seen.has(trip.id) || !Array.isArray(trip.people) || !trip.people.length || new Set(trip.people).size !== trip.people.length || !Array.isArray(trip.entries)) throw new TypeError('Invalid trip');
    seen.add(trip.id);
    const entries = trip.entries.map(entry => ledger.normalize(entry, trip.people));
    if (entries.some(entry => entry === null)) throw new TypeError('Invalid ledger entry');
    return { id: trip.id, summary: ledger.summarize(entries, trip.people, trip.rate) };
  });
}
