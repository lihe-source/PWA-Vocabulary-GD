const CACHE_PREFIX = 'Voc-PWA-';
const CACHE_NAME = 'Voc-PWA-V7_0_4';
const APP_SHELL = [
  './',
  './index.html',
  './style.css?v=V7_0_4',
  './app.js?v=V7_0_4',
  './manifest.json?v=V7_0_4',
  './version.json',
  './storage.js?v=V7_0_4',
  './backup-schema.js?v=V7_0_4',
  './version-manager.js?v=V7_0_4',
  './chart-renderer.js?v=V7_0_4',
  './jszip.min.js?v=3_10_1',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    const freshRequests = APP_SHELL.map(url => new Request(new URL(url, self.location.href), { cache: 'reload' }));
    await cache.addAll(freshRequests);
  })());
});

self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
        .map(key => caches.delete(key))
    );
    await self.clients.claim();
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    clients.forEach(client => client.postMessage({ type: 'SW_ACTIVATED', version: CACHE_NAME }));
  })());
});

async function networkFirst(request, fallbackUrl) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(new Request(request, { cache: 'no-store' }));
    if (response?.ok) {
      cache.put(request, response.clone()).catch(() => {});
    }
    return response;
  } catch {
    return (await cache.match(request)) || (fallbackUrl ? await cache.match(fallbackUrl) : Response.error());
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(new Request(request, { cache: 'no-store' }));
  if (response?.ok) {
    cache.put(request, response.clone()).catch(() => {});
  }
  return response;
}

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.endsWith('/version.json')) {
    event.respondWith(fetch(event.request, { cache: 'no-store' }).catch(async () => {
      const cache = await caches.open(CACHE_NAME);
      return (await cache.match(new URL('./version.json', self.location.href).href)) || Response.error();
    }));
    return;
  }

  if (event.request.mode === 'navigate') {
    event.respondWith(networkFirst(event.request, './index.html'));
    return;
  }

  const isStatic = /\.(?:js|css|json|png|svg|webp|ico)$/i.test(url.pathname);
  event.respondWith(isStatic ? cacheFirst(event.request) : networkFirst(event.request));
});
