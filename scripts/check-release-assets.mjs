// Compare the normal entry and its exact local asset URLs with a release checkout.
import { readFile } from 'node:fs/promises';
import { relative, resolve, isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';

export async function checkReleaseAssets(entry, directory, extra = [], request = fetch) {
  const base = new URL(entry);
  if (!['https:', 'http:'].includes(base.protocol) || !base.pathname.endsWith('/') || base.search || base.hash)
    throw new Error('Use the normal entry directory URL, ending in /');
  const html = await readFile(resolve(directory, 'index.html'));
  const urls = [base.href];
  for (const [, tag, attributes] of html.toString().matchAll(/<(script|link)\b([^>]+)>/gi)) {
    const attribute = name => attributes.match(new RegExp(`\\s${name}\\s*=\\s*["']([^"']+)["']`, 'i'))?.[1];
    const ref = tag.toLowerCase() === 'script' ? attribute('src')
      : attribute('rel')?.toLowerCase() === 'stylesheet' ? attribute('href') : null;
    if (ref) {
      const url = new URL(ref, base);
      if (url.origin === base.origin) urls.push(url.href);
    }
  }
  urls.push(...extra.map(ref => new URL(ref, base).href));
  return Promise.all([...new Set(urls)].map(async href => {
    const url = new URL(href);
    if (url.origin !== base.origin || !url.pathname.startsWith(base.pathname))
      throw new Error('Asset outside the release directory: ' + href);
    const filename = decodeURIComponent(url.pathname.slice(base.pathname.length)) || 'index.html';
    const local = resolve(directory, filename);
    const within = relative(directory, local);
    if (isAbsolute(within) || within === '..' || within.startsWith('../') || within.startsWith('..\\'))
      throw new Error('Invalid asset path: ' + href);
    const expected = filename === 'index.html' ? html : await readFile(local);
    const response = await request(url, { redirect: 'error', signal: AbortSignal.timeout(15000) });
    const failure = !response.ok ? 'HTTP ' + response.status
      : expected.equals(Buffer.from(await response.arrayBuffer())) ? null : 'Inhalt weicht vom Release ab';
    return { href, failure };
  }));
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const [entry, directory, ...extra] = process.argv.slice(2);
  try {
    for (const { href, failure } of await checkReleaseAssets(entry, directory, extra)) {
      console.log((failure || 'OK') + '  ' + href);
      if (failure) process.exitCode = 1;
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
