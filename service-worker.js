const CACHE_NAME = 'octagon-pwa-v3-t2-o10-1';

const PRECACHE_ASSETS = [
  '/', '/index.html', '/style.css', '/app.js', '/manifest.json',
  '/vnext/client/connectivity/connection-status.css',
  '/vnext/client/connectivity/connection-status.js',
  '/vnext/client/offline/offline-store.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(PRECACHE_ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then(names => Promise.all(names.map(name => name === CACHE_NAME ? null : caches.delete(name)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (event) => {
  const requestUrl = new URL(event.request.url);
  const sameOrigin = requestUrl.origin === self.location.origin;
  const forbidden = /(^|\/)(\.env|database(?:\.db|\.json)?|.*\.sqlite(?:3)?)(\/|$)/i.test(requestUrl.pathname);

  // API/auth/event traffic is authoritative and is never cached or replaced
  // with a synthetic success response.
  if (requestUrl.pathname.startsWith('/api/') || !sameOrigin || forbidden) {
    event.respondWith(fetch(event.request));
    return;
  }

  const isStaticAsset = event.request.destination === 'style' ||
    event.request.destination === 'image' ||
    event.request.destination === 'font' ||
    requestUrl.pathname.endsWith('.css') || requestUrl.pathname.endsWith('.svg') ||
    requestUrl.pathname.endsWith('.png') || requestUrl.pathname.endsWith('.ico') ||
    PRECACHE_ASSETS.includes(requestUrl.pathname);

  if (isStaticAsset) {
    event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request).then(response => {
      if (response && response.status === 200) caches.open(CACHE_NAME).then(cache => cache.put(event.request, response.clone()));
      return response;
    })));
    return;
  }

  // Only the known shell can be used when offline. Dynamic business pages and
  // data are not silently persisted by the service worker.
  event.respondWith(fetch(event.request).catch(() => caches.match(event.request).then(cached => {
    if (cached) return cached;
    if ((event.request.headers.get('accept') || '').includes('text/html')) return caches.match('/index.html');
    return new Response('Offline shell only; authoritative data requires the server.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  })));
});
