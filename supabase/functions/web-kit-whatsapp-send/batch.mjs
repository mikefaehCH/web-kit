// The store must implement claimNext atomically and durably. A claimed item
// is never reclaimed automatically: the provider might already have accepted it.
export async function runBatch({ store, batchId, actorId, send }) {
  if (!store || typeof store.claimNext !== 'function' || typeof store.finish !== 'function' || typeof send !== 'function') throw new TypeError('Invalid batch dependencies');
  if (typeof batchId !== 'string' || !batchId || typeof actorId !== 'string' || !actorId) throw new TypeError('Batch and actor are required');
  let processed = 0;
  while (true) {
    // claimNext checks ownership and atomically refuses claims while any item
    // in this batch is pending or unknown, including after a worker crash.
    const item = await store.claimNext({ batchId, actorId });
    if (item === null) return { processed, stopped: false };
    if (!item || typeof item.id !== 'string' || typeof item.requestKey !== 'string') throw new Error('Invalid claim');
    let outcome;
    try { outcome = await send(item); } catch { outcome = { status: 'unknown' }; }
    // Only explicitly recorded provider acceptance or rejection is definitive.
    if (!outcome || !['accepted', 'failed'].includes(outcome.status)) outcome = { status: 'unknown' };
    try {
      const committed = await store.finish({ batchId, actorId, itemId: item.id, requestKey: item.requestKey, outcome });
      if (committed !== true) return { processed, stopped: true, reason: 'unrecorded' };
    } catch { return { processed, stopped: true, reason: 'unrecorded' }; }
    processed++;
    if (outcome.status === 'unknown') return { processed, stopped: true, reason: 'unknown' };
  }
}
