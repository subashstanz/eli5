const CACHE_NAME = 'eli5-pwa-v1';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/styles.css',
  '/app.js',
  '/manifest.webmanifest'
];

// Install: cache static assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// Activate: clean old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Fetch strategy:
// - Static assets: cache-first
// - Reddit API: network-first with cache fallback
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  if (url.hostname === 'www.reddit.com') {
    // Network-first for API calls
    event.respondWith(
      fetch(request)
        .then(response => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
          return response;
        })
        .catch(() => caches.match(request))
    );
  } else {
    // Cache-first for static assets
    event.respondWith(
      caches.match(request).then(cached => cached || fetch(request))
    );
  }
});
