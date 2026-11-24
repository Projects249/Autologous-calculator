const CACHE_PREFIX = 'tbv-calculator-';
const CACHE_NAME = `${CACHE_PREFIX}v8`;
const PAGE_URL = './index.html';
const PAGE_PATH = new URL(PAGE_URL, self.location.href).pathname;
const APP_ROOT_PATH = new URL('./', self.location.href).pathname;
const APP_SHELL = [
  PAGE_URL,
  './manifest.json',
  './Icon(192).png',
  './Icon(512).png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => Promise.all(
        cacheNames
          .filter((cacheName) => cacheName.startsWith(CACHE_PREFIX) && cacheName !== CACHE_NAME)
          .map((cacheName) => caches.delete(cacheName))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) {
    return;
  }

  event.respondWith((async () => {
    try {
      const isAppEntryRequest = isAppEntry(request);
      const response = isAppEntryRequest
        ? await fetch(request, { cache: 'no-store' })
        : await fetch(request);
      if (isAppEntryRequest && (response.status === 404 || response.status === 410)) {
        try {
          await disableUnpublishedApp();
        } catch (error) {
          console.error('Unable to completely remove the unpublished app cache.', error);
        }
        return response;
      }

      if (response.ok) {
        const cache = await caches.open(CACHE_NAME);
        await cache.put(request, response.clone());
        return response;
      }

      const cachedResponse = await getCachedResponse(request);
      return cachedResponse ?? response;
    } catch {
      return await getCachedResponse(request) ?? Response.error();
    }
  })());
});

function isAppEntry(request) {
  if (request.mode !== 'navigate') return false;
  const url = new URL(request.url);
  return url.origin === self.location.origin &&
    (url.pathname === PAGE_PATH || url.pathname === APP_ROOT_PATH);
}

async function disableUnpublishedApp() {
  const cacheNames = await caches.keys();
  await Promise.all(
    cacheNames
      .filter((cacheName) => cacheName.startsWith(CACHE_PREFIX))
      .map((cacheName) => caches.delete(cacheName))
  );
  await self.registration.unregister();

  const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  clients.forEach((client) => client.postMessage({ type: 'APP_UNPUBLISHED' }));
}

async function getCachedResponse(request) {
  const cachedResponse = await caches.match(request);
  if (cachedResponse) return cachedResponse;

  if (request.mode === 'navigate') {
    return caches.match(PAGE_URL);
  }

  return undefined;
}
