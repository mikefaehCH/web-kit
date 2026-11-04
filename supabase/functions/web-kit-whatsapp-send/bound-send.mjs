import { runBatch } from './batch.mjs';

// Call only behind the existing server-side admin and MFA checks. Both batch
// creation and resumption must use this same message preparation function.
export async function prepareMessage(message) {
  if (typeof message !== 'string' || !message.trim() || message.length > 4000) throw new TypeError('Invalid message');
  const text = message.trim();
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return { text, messageHash: Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('') };
}

export async function sendPreparedBatch({ store, batchId, actorId, message, send }) {
  if (typeof send !== 'function') throw new TypeError('Send adapter required');
  const prepared = await prepareMessage(message);
  // The text and hash are captured together and never supplied by the client as
  // separate values. The database must compare this hash before claiming.
  return runBatch({ store, batchId, actorId, messageHash: prepared.messageHash,
    send: item => send({ chatId: item.chatId, requestKey: item.requestKey, message: prepared.text }) });
}
