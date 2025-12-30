const CACHE_NAME = 'notebook-v0.0.3';
const ASSETS = [
  '/',
  '/js/qrcode.min.js',
  '/plain/index.html',
  '/favicon.ico',
  '/index.html',
  '/logo.svg',
  '/logo192.png',
  '/logo512.png',
  '/manifest.webmanifest',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    }),
  );
});

self.addEventListener('activate', (event) => {
  const cacheAllowlist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (!cacheAllowlist.includes(cacheName)) {
            console.log('Service Worker: Deleting old cache', cacheName);
            return caches.delete(cacheName);
          }
        }),
      );
    }),
  );
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches
      .match(event.request)
      .then((response) => {
        return (
          response ||
          fetch(event.request).then((fetchResponse) => {
            return caches.open(CACHE_NAME).then((cache) => {
              // Only cache successful GET requests
              if (
                event.request.method === 'GET' &&
                fetchResponse.status === 200
              ) {
                cache.put(event.request, fetchResponse.clone());
              }
              return fetchResponse;
            });
          })
        );
      })
      .catch(() => {
        // Fallback if offline and asset not in cache
        return caches.match('/');
      }),
  );
});
