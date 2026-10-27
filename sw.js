const CACHE_NAME = 'u9-tactical-board-v7';
const APP_SHELL = [
  './', './index.html', './styles.css', './library.css', './manifest.webmanifest',
  './js/app.js', './js/builtins.js', './js/constants.js', './js/formations.js', './js/geometry.js',
  './js/library.js', './js/library-ui.js', './js/render.js', './js/restarts.js', './js/simulation.js', './js/state.js', './js/storage.js', './js/zone-constraints.js',
  './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(names.filter((name) => name.startsWith('u9-tactical-board-') && name !== CACHE_NAME).map((name) => caches.delete(name))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request).then((response) => {
      if (!response || response.status !== 200 || response.type !== 'basic') return response;
      const clone = response.clone();
      caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
      return response;
    }).catch(() => event.request.mode === 'navigate' ? caches.match('./index.html') : Response.error())),
  );
});
