/* Only this deployment's explicitly public app shell; no authenticated responses. */
const PREFIX = 'travel-shell:' + self.registration.scope + ':';
const CACHE = PREFIX + 'v3';
const ASSETS = [
  './',
  './index.html',
  './app.js',
  './config.js',
  './style.css',
  './icon.svg',
  './icon-192.png',
  './icon-512.png',
  './apple-touch-icon.png',
  './manifest.webmanifest',
  './trips/city.js',
  './trips/walking.js',
  './modules/config.js',
  './modules/travel-view.js',
  './modules/state.js',
  './modules/places.js',
  './modules/map.js',
  './vendor/leaflet/leaflet.js',
  './vendor/leaflet/leaflet.css',
];
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(ASSETS))
      .then(() => self.skipWaiting()),
  );
});
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith(PREFIX) && key !== CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});
self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (
    request.method !== 'GET' ||
    request.headers.has('authorization') ||
    !url.href.startsWith(self.registration.scope) ||
    url.origin !== self.location.origin
  )
    return;
  const path = url.origin + url.pathname;
  const known = ASSETS.some((asset) => new URL(asset, self.registration.scope).href === path);
  if (!known) return;
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      const key = new Request(path);
      try {
        const response = await fetch(request);
        if (
          response.ok &&
          response.type === 'basic' &&
          !response.headers.get('cache-control')?.includes('no-store')
        )
          await cache.put(key, response.clone());
        return response;
      } catch {
        return (await cache.match(key)) || Response.error();
      }
    })(),
  );
});
