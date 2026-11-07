import assert from 'node:assert/strict';
import test from 'node:test';
import { createAiHandler, issueGrant } from './endpoint.mjs';

const origin = 'https://site.example';
const secret = 'synthetic test signing material of sufficient length';
const time = 1800000000000;
const source = (id, text) => ({ id, label: 'Route', text, url: origin + '/' + id + '#route' });
const projects = {
  demo: {
    origins: [origin],
    pages: {
      first: { kind: 'page', sources: [source('first', 'Birkenhafen')] },
      second: { kind: 'page', sources: [source('second', 'Lindenbrück')] },
      empty: { kind: 'page' },
      wizard: { kind: 'wizard', shareDraft: true },
      basic: { kind: 'wizard' },
    },
  },
  other: { origins: [origin], pages: { first: { kind: 'page', sources: [source('other', 'Anderer Kontext')] } } },
};
const grant = (page, project = 'demo', at = time) =>
  issueGrant({ page, project, subject: 'tester', origin }, secret, at);
const options = { projects, key: 'synthetic-api-key', grantSecret: secret, now: () => time };
const result = data => Response.json({
  status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(data) }] }],
});
const ask = (handler, page, input = {}, headers = {}) => handler(new Request('https://api.example/api/ai', {
  method: 'POST',
  headers: { Origin: origin, 'Content-Type': 'application/json', Authorization: 'Bearer ' + grant(page), ...headers },
  body: JSON.stringify({ project: 'demo', page, question: 'Wo endet die Etappe?', ...input }),
}));

test('page and project grants scope even when the origin is shared', async () => {
  const calls = [];
  const handle = createAiHandler({ ...options, fetchOpenAI: async (url, request) => {
    const body = JSON.parse(request.body);
    const input = JSON.parse(body.input);
    calls.push(input);
    assert.equal(url, 'https://api.openai.com/v1/responses');
    assert.equal(body.store, false);
    assert.equal(body.text.format.strict, true);
    assert.equal(request.signal instanceof AbortSignal, true);
    return result({ answer: input.sources[0].text, sourceIds: [input.sources[0].id] });
  } });
  const first = await ask(handle, 'first');
  assert.equal(first.headers.get('Access-Control-Allow-Origin'), origin);
  assert.deepEqual(await first.json(), { answer: 'Birkenhafen', sources: [{ label: 'Route', url: origin + '/first#route' }] });
  const second = await ask(handle, 'second', { previous: 'Wo endet sie?' });
  assert.equal((await second.json()).answer, 'Lindenbrück');
  assert.equal(calls[1].previous, 'Wo endet sie?');
  assert.equal(Object.hasOwn(calls[1].sources[0], 'url'), false);
  assert.equal((await ask(handle, 'first', { page: 'second' })).status, 403);
  assert.equal((await ask(handle, 'first', { project: 'other' })).status, 403);
  assert.equal((await ask(handle, 'first', {}, { Origin: 'https://foreign.example' })).status, 403);
  assert.equal((await ask(handle, 'first', {}, { Authorization: 'Bearer ' + grant('first', 'demo', time - 300001) })).status, 401);
  assert.equal((await ask(handle, 'first', {}, { Authorization: '' })).status, 401);
  assert.equal(calls.length, 2);
});

test('missing context, unsupported citations and provider failure are handled without false links', async () => {
  let calls = 0;
  const handle = createAiHandler({ ...options, fetchOpenAI: async () => {
    calls++;
    if (calls === 1) return result({ answer: 'An erfundener Ort', sourceIds: [] });
    if (calls === 2) return result({ answer: 'Fremde Antwort', sourceIds: ['second'] });
    if (calls === 3) return new Response(null, { status: 429 });
    throw new DOMException('Timeout', 'TimeoutError');
  } });
  assert.match((await (await ask(handle, 'empty')).json()).answer, /keine freigegebene Angabe/);
  assert.equal(calls, 0);
  assert.match((await (await ask(handle, 'first')).json()).answer, /keine freigegebene Angabe/);
  assert.equal((await ask(handle, 'first')).status, 502);
  assert.equal((await ask(handle, 'first')).status, 502);
  assert.equal((await ask(handle, 'first')).status, 502);
});

test('wizard validates additive fields and rejects private payload outside configured scope', async () => {
  const field = { id: 'datum', label: 'Datum', type: 'date' };
  const handle = createAiHandler({ ...options, fetchOpenAI: async (_, request) => {
    const input = JSON.parse(JSON.parse(request.body).input);
    assert.deepEqual(input.draft, { mode: 'app', fields: [field] });
    const type = input.question === 'Ändere Typ' ? 'number' : 'date';
    return result({ answer: 'Vorschlag', brief: null, fields: [{ ...field, type, label: 'Trainingstag' }] });
  } });
  const draft = { mode: 'app', fields: [field] };
  assert.equal((await ask(handle, 'basic', { draft })).status, 403);
  assert.equal((await ask(handle, 'first', { draft })).status, 403);
  assert.equal((await ask(handle, 'wizard', { draft: { ...draft, entries: ['privat'] } })).status, 400);
  const answer = await ask(handle, 'wizard', { draft });
  assert.equal(answer.status, 200);
  assert.equal((await answer.json()).proposal.fields[0].id, 'datum');
  assert.equal((await ask(handle, 'wizard', { draft, question: 'Ändere Typ' })).status, 502);
});

test('concurrent and per-account requests have server-side limits', async () => {
  let release;
  let started = 0;
  let allStarted;
  const gate = new Promise(resolve => { release = resolve; });
  const ready = new Promise(resolve => { allStarted = resolve; });
  const handle = createAiHandler({ ...options, fetchOpenAI: async () => {
    if (++started === 4) allStarted();
    await gate;
    return result({ answer: 'Birkenhafen', sourceIds: ['first'] });
  } });
  const pending = Array.from({ length: 4 }, () => ask(handle, 'first'));
  await ready;
  assert.equal((await ask(handle, 'first')).status, 429);
  release();
  assert.deepEqual((await Promise.all(pending)).map(response => response.status), [200, 200, 200, 200]);
  assert.equal((await ask(handle, 'first')).status, 200);
  assert.equal((await ask(handle, 'first')).status, 200);
  assert.equal((await ask(handle, 'first')).status, 429);
});
