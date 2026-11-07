import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { createAiHandler } from './endpoint.mjs';

const env = process.env;
const projects = JSON.parse(await readFile(env.WEB_KIT_AI_PROJECTS, 'utf8'));
const handle = createAiHandler({
  projects, key: env.OPENAI_API_KEY, grantSecret: env.WEB_KIT_AI_GRANT_SECRET,
});
const server = createServer({ requestTimeout: 25000, headersTimeout: 5000 }, async (incoming, outgoing) => {
  if (incoming.url !== '/api/ai') {
    outgoing.writeHead(404, { 'Cache-Control': 'no-store' }).end();
    return;
  }
  try {
    const body = incoming.method === 'POST' ? Readable.toWeb(incoming) : undefined;
    const request = new Request('http://localhost/api/ai', {
      method: incoming.method, headers: incoming.headers, body, duplex: 'half',
    });
    const response = await handle(request);
    outgoing.writeHead(response.status, Object.fromEntries(response.headers));
    outgoing.end(Buffer.from(await response.arrayBuffer()));
  } catch {
    if (!outgoing.headersSent) outgoing.writeHead(400, { 'Cache-Control': 'no-store' });
    outgoing.end();
  }
});
server.listen(Number(env.PORT ?? 8787), env.WEB_KIT_AI_BIND ?? '127.0.0.1');
