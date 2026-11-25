// Offline shell cache. User data lives in IndexedDB and is never touched here.
const V = 'rupiq-shell-v1';
const FILES = ['./', 'index.html', 'styles.css', 'theme-init.js', 'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png', 'src/app.js', 'src/calc.js', 'src/data.js', 'src/dates.js', 'src/money.js', 'src/store.js'];
self.addEventListener('install', e => { e.waitUntil(caches.open(V).then(c => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(fetch(e.request).then(r => { const copy = r.clone(); caches.open(V).then(c => c.put(e.request, copy)); return r; }).catch(() => caches.match(e.request).then(r => r || caches.match('index.html'))));
});
