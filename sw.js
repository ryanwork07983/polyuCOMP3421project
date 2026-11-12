/* Service worker: caches the app files so The Workout opens offline.
   Only used when the app is served over http(s) (for example GitHub Pages). */
const CACHE = 'the-workout-v2';
const FILES = [
  './', './index.html', './manifest.webmanifest', './icons/icon.svg', './css/styles.css',
  './js/i18n.js', './js/utils.js', './js/db.js', './js/stats.js', './js/seed.js', './js/charts.js', './js/timer.js',
  './js/views/exercises.js', './js/views/plans.js', './js/views/log.js', './js/views/history.js',
  './js/views/dashboard.js', './js/views/settings.js', './js/app.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Network first, so updates show up straight away; fall back to the cache when offline.
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return;
  event.respondWith(
    fetch(event.request, { cache: 'no-cache' }) // always check with the server, so the browser's own cache can't serve an old file
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE).then((cache) => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request).then((hit) => hit || caches.match('./index.html')))
  );
});
