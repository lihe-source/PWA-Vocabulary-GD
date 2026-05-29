const CACHE_NAME = 'Voc-PWA-V5_3';
const ASSETS = ['./', './index.html', './style.css', './app.js', './manifest.json', './icon-192.png', './icon-512.png'];

// Install: cache all assets, then immediately activate (no waiting for old tabs)
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting(); // activate new SW immediately
});

// Activate: delete ALL old caches, then take control of all open pages right away
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim()) // take over all open pages immediately
  );
  // Notify all open pages that a new version is active
  self.clients.matchAll({ type: 'window' }).then(clients => {
    clients.forEach(client => client.postMessage({ type: 'SW_UPDATED', version: CACHE_NAME }));
  });
});

// Fetch: network-first for app files (always try to get latest), cache as fallback
self.addEventListener('fetch', e => {
  // Skip non-GET and external API calls — let them go straight to network
  if (e.request.method !== 'GET') return;
  if (e.request.url.includes('generativelanguage.googleapis.com')) return;
  if (e.request.url.includes('googleapis.com')) return;
  if (e.request.url.includes('accounts.google.com')) return;
  if (e.request.url.includes('cdn.jsdelivr.net')) return;
  if (e.request.url.includes('fonts.googleapis.com')) return;
  if (e.request.url.includes('fonts.gstatic.com')) return;

  e.respondWith(
    fetch(e.request)
      .then(response => {
        // Save fresh copy to cache
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(e.request)) // offline fallback
  );
});
