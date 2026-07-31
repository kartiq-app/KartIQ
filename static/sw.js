const CACHE = 'kartiq-v5-5-13';

const ASSETS = [
  '/',
  '/static/css/kartiq.css',
  '/static/css/00-foundations.css',
  '/static/css/10-components-live.css',
  '/static/css/20-mobile-focus.css',
  '/static/css/30-modes-portrait.css',
  '/static/css/40-landscape-overrides.css',
  '/static/css/50-endurance-latest.css',
  '/static/js/core/core.js',
  '/static/js/sprint/sprint.js',
  '/static/js/qualification/qualification.js',
  '/static/js/ui/race-ui.js',
  '/static/js/endurance/queues.js',
  '/static/js/core/bootstrap.js',
  '/static/manifest.json',
  '/static/fonts/f1-regular.woff2',
  '/static/fonts/f1-torque.woff2',
  '/static/icons/kartiq-180.png',
  '/static/icons/kartiq-192.png',
  '/static/icons/kartiq-512.png',
  '/static/assets/RT10_main.png'
];

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(ASSETS).catch(() => {}))
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      caches.keys().then(keys => Promise.all(
        keys.filter(key => key !== CACHE).map(key => caches.delete(key))
      ))
    ])
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
});
