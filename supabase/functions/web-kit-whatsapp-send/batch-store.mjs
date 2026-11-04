// The RPCs behind this adapter must use a transaction and an exclusive batch
// lock, verify ownership, and reject browser roles. Until deployed and tested,
// this adapter must not be connected to the user-facing sender.
export function createBatchStore(rpc) {
  if (typeof rpc !== 'function') throw new TypeError('RPC client required');
  async function invoke(name, args) {
    const result = await rpc(name, args);
    if (!result || result.error) throw new Error('Batch storage unavailable');
    return result.data;
  }
  return {
    async inspect({ batchId, actorId }) {
      const data = await invoke('web_kit_whatsapp_batch_inspect', { p_batch: batchId, p_actor: actorId });
      if (!data || !Array.isArray(data.items) || data.items.length > 10 ||
          data.items.some(item => !item || typeof item.item_id !== 'string' ||
            typeof item.chat_id !== 'string' || typeof item.review_available !== 'boolean' || !['queued','pending','accepted','failed','unknown','reviewed'].includes(item.status))) throw new Error('Invalid batch status');
      return data.items.map(item => ({ id: item.item_id, chatId: item.chat_id, status: item.status, reviewAvailable: item.review_available }));
    },
    async resolve({ batchId, actorId, itemId, confirmed }) {
      if (confirmed !== true) throw new Error('Explicit confirmation required');
      const data = await invoke('web_kit_whatsapp_batch_resolve', { p_batch: batchId, p_actor: actorId, p_item: itemId, p_confirm: true });
      return data === true;
    },
    async claimNext({ batchId, actorId, messageHash }) {
      const data = await invoke('web_kit_whatsapp_batch_claim', { p_batch: batchId, p_actor: actorId, p_message_hash: messageHash });
      if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Invalid batch claim');
      if (data.state === 'complete') return null;
      if (data.state === 'blocked') return { blocked: true };
      if (data.state !== 'claimed' || typeof data.item_id !== 'string' || typeof data.request_key !== 'string' || typeof data.chat_id !== 'string') throw new Error('Invalid batch claim');
      return { id: data.item_id, requestKey: data.request_key, chatId: data.chat_id };
    },
    async finish({ batchId, actorId, itemId, requestKey, outcome }) {
      if (!outcome || !['accepted', 'failed', 'unknown'].includes(outcome.status)) throw new Error('Invalid dispatch outcome');
      const providerId = outcome.status === 'accepted' ? outcome.providerId : null;
      if (outcome.status === 'accepted' && (typeof providerId !== 'string' || !/^[A-Za-z0-9._:@-]{1,128}$/.test(providerId))) throw new Error('Invalid provider reference');
      const data = await invoke('web_kit_whatsapp_batch_finish', { p_batch: batchId, p_actor: actorId, p_item: itemId, p_key: requestKey, p_status: outcome.status, p_provider_id: providerId });
      return data === true;
    },
  };
}
