const CACHE = 'qoe-cache-v1';
const FILES = [
  './',
  './index.html',
  './manifest.json',
  './network.js',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(FILES))
      .catch(err => console.warn('Cache error:', err))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.map(k => k !== CACHE ? caches.delete(k) : null))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  event.respondWith(
    fetch(event.request)
      .catch(() => caches.match(event.request))
  );
});

self.addEventListener('push', event => {
  let data = event.data ? event.data.json() : {};
  event.waitUntil(
    self.registration.showNotification(
      data.title || 'QoE Alert',
      {
        body: data.body || 'Network update',
        icon: 'icons/icon-192.png',
        badge: 'icons/icon-192.png'
      }
    )
  );
});
