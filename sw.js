const CACHE_PREFIX = 'Voc-PWA-';
const CACHE_NAME = 'Voc-PWA-V7_5_0';
const APP_SHELL = ['./',
  './index.html',
  './style.css?v=V7_5_0',
  './manifest.json?v=V7_5_0',
  './version.json',
  './cloud-config.json',
  './app.js?v=V7_5_0',
  './storage.js?v=V7_5_0',
  './backup-schema.js?v=V7_5_0',
  './study-streak.js?v=V7_5_0',
  './version-manager.js?v=V7_5_0',
  './chart-renderer.js?v=V7_5_0',
  './push-config.js?v=V7_5_0',
  './reminder-manager.js?v=V7_5_0',
  './task-manager.js?v=V7_5_0',
  './network.js?v=V7_5_0',
  './backup-worker-client.js?v=V7_5_0',
  './backup-worker.js?v=V7_5_0',
  './draft-manager.js?v=V7_5_0',
  './data-repository.js?v=V7_5_0',
  './data-operations.js?v=V7_5_0',
  './sentence-key.js?v=V7_5_0',
  './parsed-cache.js?v=V7_5_0',
  './cloud-auth-client.js?v=V7_5_0',
  './request-scope.js?v=V7_5_0',
  './ai-models.js?v=V7_5_0',
  './gemini-service.js?v=V7_5_0',
  './model-catalog.js?v=V7_5_0',
  './zip-client.js?v=V7_5_0',
  './zip-worker.js?v=V7_5_0',
  './jszip.min.js?v=3_10_1',
  './icon-192.png',
  './icon-512.png'];

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

async function networkFirst(request,fallbackUrl,timeout=1800) {
  const cache=await caches.open(CACHE_NAME),controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeout);
  try {
    const response=await fetch(new Request(request,{cache:'no-store',signal:controller.signal}));
    // Consume the body before releasing the deadline; stalled bodies must also
    // fall back to the cached file rather than leaving startup waiting forever.
    if(!response.ok)throw new Error('HTTP_'+response.status);
    const buffered=new Response(await response.arrayBuffer(),{status:response.status,headers:response.headers});
    await cache.put(request,buffered.clone());return buffered;
  }catch{
    return (await cache.match(request)) || (fallbackUrl?await cache.match(fallbackUrl):Response.error());
  }finally{clearTimeout(timer);}
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

self.addEventListener('push', event => {
  let payload = {};
  try { payload = event.data?.json() || {}; }
  catch {
    try { payload = { title: '英文單字複習時間到了', options: { body: event.data?.text() || '' } }; }
    catch { payload = {}; }
  }

  const declarative = payload.notification || {};
  const title = payload.title || declarative.title || '英文單字複習時間到了';
  const options = payload.options || {
    body: declarative.body || '每天複習一點點，保持英文學習節奏！',
    icon: declarative.icon,
    badge: declarative.badge,
    tag: declarative.tag || 'vocabulary-daily-reminder',
    data: declarative.data || payload.data || { url: './' }
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  let targetUrl;
  try { targetUrl = new URL(event.notification.data?.url || './', self.location.href).href; }
  catch { targetUrl = new URL('./', self.location.href).href; }

  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of windows) {
      if (new URL(client.url).origin !== new URL(targetUrl).origin) continue;
      try { await client.navigate(targetUrl); } catch {}
      return client.focus();
    }
    return self.clients.openWindow ? self.clients.openWindow(targetUrl) : undefined;
  })());
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.endsWith('/version.json')) {
    event.respondWith(networkFirst(event.request,'./version.json',3000));
    return;
  }

  // Deployment-specific Worker URL may be filled in after the first GitHub
  // Pages release. Always prefer the network so that change does not require
  // another app version bump, while keeping the cached copy for offline use.
  if (url.pathname.endsWith('/push-config.js') || url.pathname.endsWith('/cloud-config.json')) {
    event.respondWith(networkFirst(event.request));
    return;
  }

  if (event.request.mode === 'navigate') {
    // Keep HTML and modules from the same fully installed release. Version
    // checks install a complete new cache before switching the app.
    event.respondWith(caches.open(CACHE_NAME).then(async cache=>
      (await cache.match('./index.html')) || networkFirst(event.request,'./index.html')));
    return;
  }

  const isStatic = /\.(?:js|css|json|png|svg|webp|ico)$/i.test(url.pathname);
  event.respondWith(isStatic ? cacheFirst(event.request) : networkFirst(event.request));
});
