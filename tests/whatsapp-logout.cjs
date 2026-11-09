const vm = require('node:vm');
const fs = require('node:fs');
const assert = require('node:assert/strict');
class Element {
  constructor() { this.handlers = {}; this.children = []; this.value = ''; this.hidden = false; this.checked = false; this.disabled = false; this.textContent = ''; }
  addEventListener(type, fn) { this.handlers[type] = fn; }
  fire(type) { return this.handlers[type]?.({ preventDefault() {} }); }
  replaceChildren(...children) { this.children = children; }
  append(...children) { this.children.push(...children); }
  focus() {}
}
const els = new Map();
const document = { querySelector(s) { if (!els.has(s)) els.set(s, new Element()); return els.get(s); }, querySelectorAll() { return []; }, createElement() { return new Element(); }, createDocumentFragment() { return new Element(); }, createTextNode(text) { return { text }; } };
const storage = new Map();
const sessionStorage = { getItem: k => storage.get(k) ?? null, setItem: (k,v) => storage.set(k,v), removeItem: k => storage.delete(k) };
vm.runInNewContext(fs.readFileSync('admin/whatsapp.js', 'utf8'), { document, sessionStorage, window: {}, crypto: { randomUUID: () => 'test-key' } });
els.get('#message').value = 'Synthetic message';
els.get('#message').fire('input');
els.get('#composer').fire('submit');
assert.equal(els.get('#review').hidden, false);
els.get('#logout').fire('click');
assert.equal(els.get('#review').hidden, true);
assert.equal(els.get('#message').value, '');
assert.equal(els.get('#preview').textContent, '');
assert.equal(els.get('#send').disabled, true);
console.log('Logout clears message and invalidates reviewed recipients');
