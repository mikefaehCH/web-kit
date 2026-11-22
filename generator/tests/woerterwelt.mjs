import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const asset = name => readFile(new URL('../woerterwelt/'+name,import.meta.url));
test('Die erste Runde enthält alle gesprochenen Hinweise und beide Lautbeispiele offline', async () => {
  const clips = JSON.parse(await asset('audio.json'));
  assert.equal(clips.length,16);
  for (const clip of clips) assert.ok(Buffer.from(clip,'base64').length>1000);
  const worker = String(await asset('sw.js'));
  for (const name of ['index.html','app.js','audio.json','style.css','fox.svg','icon.png','manifest.webmanifest']) {
    assert.ok(worker.includes("'"+name+"'"));
    assert.ok((await asset(name)).length>0);
  }
  const manifest = JSON.parse(await asset('manifest.webmanifest'));
  assert.equal(manifest.scope,'./');
  assert.equal(manifest.display,'standalone');
});
