const test = require('node:test');
const vm = require('node:vm');
const fs = require('node:fs');
const assert = require('node:assert/strict');

class Element {
  constructor() { this.handlers = {}; this.children = []; this.value = ''; this.hidden = false; this.disabled = false; this.textContent = ''; }
  addEventListener(type, fn) { this.handlers[type] = fn; }
  fire(type) { return this.handlers[type]?.({ preventDefault() {} }); }
  replaceChildren(...children) { this.children = children; }
  append(...children) { this.children.push(...children); }
  focus() {}
}

function setup(response) {
  const elements = new Map();
  const document = {
    querySelector(selector) { if (!elements.has(selector)) elements.set(selector, new Element()); return elements.get(selector); },
    querySelectorAll() { return []; },
    createElement() { return new Element(); },
  };
  const storage = new Map();
  const sessionStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) };
  const calls = [];
  const fetch = async (url, options) => { calls.push({ url, options, body: JSON.parse(options.body) }); return response; };
  const window = { WEB_KIT_WHATSAPP_ENDPOINT: 'https://example.supabase.co/functions/v1/web-kit-whatsapp-send', WEB_KIT_GET_ACCESS_TOKEN: async () => 'user-jwt' };
  vm.runInNewContext(fs.readFileSync('admin/whatsapp.js', 'utf8'), { document, sessionStorage, window, crypto: { randomUUID: () => '11111111-1111-4111-8111-111111111111' }, fetch, Error });
  return { elements, storage, calls };
}

async function reviewAndConfirm(context) {
  const get = selector => context.elements.get(selector);
  get('#message').value = 'Synthetische Nachricht';
  get('#message').fire('input');
  get('#composer').fire('submit');
  await get('#confirm').fire('click');
}

test('sendet genau einen geschützten Request ohne Empfänger-ID aus dem Browser', async () => {
  const context = setup({ ok: true, status: 200, json: async () => ({ status: 'accepted' }) });
  await reviewAndConfirm(context);
  assert.equal(context.calls.length, 1);
  assert.deepEqual(context.calls[0].body, { message: 'Synthetische Nachricht', requestKey: '11111111-1111-4111-8111-111111111111' });
  assert.equal(context.calls[0].options.headers.Authorization, 'Bearer user-jwt');
  assert.equal('chatId' in context.calls[0].body, false);
  assert.equal('action' in context.calls[0].body, false);
  assert.equal(context.storage.size, 0);
  assert.match(context.elements.get('#status').textContent, /Annahme ist keine Zustellbestätigung/);
});

test('hält nach einem unklaren Ergebnis weitere Versuche fail-closed', async () => {
  const context = setup({ ok: false, status: 504, json: async () => ({ status: 'unknown' }) });
  await reviewAndConfirm(context);
  assert.equal(context.storage.get('web-kit-whatsapp-in-progress'), '11111111-1111-4111-8111-111111111111');
  context.elements.get('#message').value = 'Noch einmal';
  context.elements.get('#message').fire('input');
  context.elements.get('#composer').fire('submit');
  assert.equal(context.calls.length, 1);
  assert.match(context.elements.get('#status').textContent, /prüfe zuerst den unterbrochenen Versand/);
});
