import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

test('navigation shows only the selected view and supports history links', () => {
  const nodes = Object.fromEntries(['cockpit', 'communication'].map(id => [id, { hidden: false }]));
  const links = ['cockpit', 'communication'].map(id => ({
    attrs: { href: '#' + id },
    getAttribute(key) { return this.attrs[key]; },
    setAttribute(key, value) { this.attrs[key] = value; },
    removeAttribute(key) { delete this.attrs[key]; },
  }));
  const document = { querySelectorAll: () => links, getElementById: id => nodes[id], title: '' };
  const location = { hash: '' };
  let onChange;
  const window = { addEventListener: (event, callback) => { if (event === 'hashchange') onChange = callback; } };
  runInNewContext(readFileSync(new URL('../admin/navigation.js', import.meta.url), 'utf8'), { document, location, window });
  assert.equal(nodes.cockpit.hidden, false);
  assert.equal(nodes.communication.hidden, true);
  assert.equal(links[0].attrs['aria-current'], 'page');
  location.hash = '#communication'; onChange();
  assert.equal(nodes.cockpit.hidden, true);
  assert.equal(nodes.communication.hidden, false);
  assert.equal(links[1].attrs['aria-current'], 'page');
  assert.equal(links[0].attrs['aria-current'], undefined);
  assert.equal(document.title, 'Web-Kit · Kommunikation');
  location.hash = '#cockpit'; onChange();
  assert.equal(nodes.cockpit.hidden, false);
  assert.equal(nodes.communication.hidden, true);
});
