const prefix = 'words:' + self.registration.scope + ':';
const cacheName = prefix + 'island3';
const files = ['./', 'lernen.js', 'biene.webp', 'drache.webp', 'supabase.js', 'post.html', 'audio.json', 'fox.svg', 'oel.webp', 'kinder.webp', 'eichhorn.webp', 'icon.png', 'familie.js', 'storch.webp', 'maus.webp', 'insel.webp', 'eltern.js', 'style.css', 'insel.js', 'stimme.json', 'falter.webp', 'app.js', 'eltern.html', 'insel.css', 'manifest.webmanifest', 'apfel.webp', 'zebra.webp', 'eule.webp', 'augen.webp', 'index.html'];
self.oninstall = event => event.waitUntil(caches.open(cacheName).then(cache => cache.addAll(files)).then(() => self.skipWaiting()));
self.onactivate = event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith(prefix) && k !== cacheName).map(k => caches.delete(k)))).then(() => self.clients.claim()));
self.onfetch = event => {
 if(event.request.method === 'GET' && event.request.url.startsWith(self.registration.scope))
   event.respondWith(caches.open(cacheName).then(async cache => (await cache.match(event.request)) || fetch(event.request)));
};
