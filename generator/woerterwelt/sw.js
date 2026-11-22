const prefix = 'words:' + self.registration.scope + ':';
const cacheName = prefix + '1';
const files = ['./','index.html','style.css','app.js','fox.svg','audio.json','manifest.webmanifest','icon.png'];
self.oninstall = event => event.waitUntil(caches.open(cacheName).then(cache => cache.addAll(files)).then(() => self.skipWaiting()));
self.onactivate = event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith(prefix) && k !== cacheName).map(k => caches.delete(k)))).then(() => self.clients.claim()));
self.onfetch = event => {
 if(event.request.method === 'GET' && event.request.url.startsWith(self.registration.scope))
   event.respondWith(caches.open(cacheName).then(async cache => (await cache.match(event.request)) || fetch(event.request)));
};
