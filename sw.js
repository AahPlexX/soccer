const APP_VERSION = '1.0.21';
const BUILD_ID = 'development'; // Replaced with the commit SHA, workflow run and attempt in the Pages artifact.
const CACHE_NAME = `u9-tactical-board-${APP_VERSION}-${BUILD_ID}`;
const APP_SHELL = [
  './', './index.html', './styles.css', './library.css', './pass-options.css', './board-ui.css', './manifest.webmanifest',
  './js/app.js', './js/board-interactions.js', './js/board-surface.js', './js/coaching.js', './js/coaching-ui.js', './js/board-actions.js', './js/update.js', './js/builtins.js', './js/constants.js', './js/formations.js', './js/geometry.js', './js/history.js', './js/view-zoom.js', './js/camera-orbit.js', './js/board-scene.js', './js/view3d.js', './vendor/three/three.module.js', './vendor/three/three.core.js',
  './js/library.js', './js/library-ui.js', './js/pass-options.js', './js/ball-physics.js', './js/board-rotation.js', './js/color-swatches.js', './js/play-script.js', './js/player-actions.js', './js/pass-options-ui.js', './js/render.js', './js/restarts.js', './js/simulation.js', './js/state.js', './js/storage.js', './js/zone-constraints.js',
  './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL.map((path) => new Request(path, { cache: 'reload' })))));
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'GET_VERSION') event.ports[0]?.postMessage({ version: APP_VERSION });
  if (event.data?.type === 'SKIP_WAITING') event.waitUntil(self.skipWaiting());
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
    caches.open(CACHE_NAME).then((cache) => cache.match(event.request).then((cached) => cached || fetch(event.request).then((response) => {
      if (!response || response.status !== 200 || response.type !== 'basic') return response;
      const clone = response.clone();
      cache.put(event.request, clone).catch(() => {});
      return response;
    }).catch(() => event.request.mode === 'navigate' ? cache.match('./index.html') : Response.error()))),
  );
});
