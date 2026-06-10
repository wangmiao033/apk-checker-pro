const CACHE_NAME = 'apkflow-shell-v1';
const ASSETS = ['/', '/manifest.webmanifest', '/icons/icon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  event.respondWith(
    fetch(request).catch(() => caches.match(request).then(res => res || caches.match('/')))
  );
});
