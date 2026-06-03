const CACHE_NAME = 'cardsync-cache-v3';
const ASSETS_TO_CACHE = [
  '/',
  '/scan',
  '/contacts',
  '/queue',
  '/settings',
  '/favicon.ico',
  '/tessdata/eng.traineddata',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // Allow partial failure for non-existent root files (like favicon if missing)
      return cache.addAll(ASSETS_TO_CACHE).catch(err => {
        console.warn("[SW] Cache pre-fill warning (continuing installation):", err);
      });
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // Only handle GET requests and ignore chrome extensions
  if (event.request.method !== 'GET' || event.request.url.startsWith('chrome-extension://')) {
    return;
  }

  const requestUrl = new URL(event.request.url);

  // Never intercept cross-origin requests (Render API, etc.) — avoids CORS/SW fetch errors
  if (requestUrl.origin !== self.location.origin) {
    return;
  }

  // Same-origin API paths (Vite dev proxy / combined deploy)
  if (
    requestUrl.pathname.startsWith('/api/') ||
    requestUrl.pathname.startsWith('/health') ||
    requestUrl.pathname.startsWith('/scan-card') ||
    requestUrl.pathname.startsWith('/contacts') ||
    requestUrl.pathname.startsWith('/integrations') ||
    requestUrl.pathname.startsWith('/admin')
  ) {
    return;
  }

  // For HTML document navigation requests (e.g. user hits refresh on /contacts)
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() => {
        // Network failed (offline), serve the cached App Shell
        return caches.match('/').then((response) => {
          return response || caches.match('/scan');
        });
      })
    );
    return;
  }

  // For static assets (JS, CSS, images, fonts)
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        // Return cached asset immediately, but fetch updated version in background (Stale-While-Revalidate)
        fetch(event.request).then((networkResponse) => {
          if (networkResponse.status === 200) {
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, networkResponse);
            });
          }
        }).catch(() => {
          // Ignore network errors during background refresh
        });
        return cachedResponse;
      }

      // Not in cache: fetch from network and cache for next time
      return fetch(event.request).then((networkResponse) => {
        if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
          return networkResponse;
        }

        const responseToCache = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseToCache);
        });

        return networkResponse;
      });
    })
  );
});
