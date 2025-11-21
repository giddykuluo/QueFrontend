const CACHE_NAME = 'qoeapp-cache-v1';
const ASSETS = [
  './',
  'index.html',
  'manifest.json',
  'network.js',
  'icons/icon-192.png',
  'icons/icon-512.png'
];

// Install SW + cache core files
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
});

// Activate SW
self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim());
});

// Fetch from cache first
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(resp => resp || fetch(event.request))
  );
});

// Push notifications
self.addEventListener('push', event => {
  let data = { title: "QoE Alert", body: "Network status changed" };
  if (event.data) {
    try { data = event.data.json(); }
    catch { data.body = event.data.text(); }
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: 'icons/icon-192.png'
    })
  );
});
