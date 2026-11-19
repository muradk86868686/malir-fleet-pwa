/**
 * =========================================================================
 * Service Worker - District Malir Fleet Gate Exit PWA
 * =========================================================================
 * Full offline caching for gate operations with zero network connectivity.
 */

const CACHE_NAME = 'malir-fleet-pwa-v1';

const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './css/style.css',
  './js/app.js',
  './js/db.js',
  './js/camera.js',
  './js/entry-grid.js',
  './js/sheet-view.js',
  './js/dashboard.js',
  './js/sync.js',
  './js/libs/chart.umd.js',
  './vehicles_master.json',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon.svg'
];

// Install event - Cache all core assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Pre-caching offline fleet assets');
      return cache.addAll(ASSETS_TO_CACHE);
    }).then(() => self.skipWaiting())
  );
});

// Activate event - Clean up old cache versions
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((name) => {
          if (name !== CACHE_NAME) {
            console.log('[SW] Removing old cache:', name);
            return caches.delete(name);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch event - Stale-while-revalidate for local assets, network-first for API
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // If request is to Google Apps Script Web App, never cache it (always network)
  if (url.hostname.includes('script.google.com') || url.hostname.includes('google.com')) {
    event.respondWith(
      fetch(event.request).catch((err) => {
        return new Response(JSON.stringify({
          status: 'error',
          message: 'Offline: Request queued locally in IndexedDB'
        }), {
          headers: { 'Content-Type': 'application/json' }
        });
      })
    );
    return;
  }

  // Stale-While-Revalidate for app assets
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const fetchPromise = fetch(event.request).then((networkResponse) => {
        // Only cache valid GET responses from our origin
        if (networkResponse && networkResponse.status === 200 && event.request.method === 'GET') {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      }).catch((fetchErr) => {
        // If offline and not in cache, fallback
        if (cachedResponse) return cachedResponse;
        throw fetchErr;
      });

      return cachedResponse || fetchPromise;
    })
  );
});
