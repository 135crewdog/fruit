/* Low-Hanging Fruit service worker: caches the app shell so the app opens offline.
 * Bump VERSION on every change to any file in app/, or devices keep the old copy.
 * The backup script, when it comes, is on another origin and is never intercepted. */
var VERSION = 'fruit-2026.10.17.2';
var SHELL = ['./', './index.html', './app.js', './rules.js', './style.css', './manifest.webmanifest', './icon.svg', './icon-192.png', './icon-512.png'];

self.addEventListener('install', function (event) {
  event.waitUntil(caches.open(VERSION).then(function (cache) { return cache.addAll(SHELL); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      // Only this app's own old caches. Cache storage is shared by every app on this origin.
      return Promise.all(keys.filter(function (k) { return k.indexOf('fruit-') === 0 && k !== VERSION; }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  // One rule for every file, pages and assets alike: network first, revalidated past the
  // browser's HTTP cache, so a new page and its new script always arrive together. The
  // cached copy serves when offline, and the app shell is the last resort for a page.
  event.respondWith(
    caches.open(VERSION).then(function (cache) {
      return fetch(req, { cache: 'no-cache' }).then(function (res) {
        if (res && res.ok) cache.put(req, res.clone());
        return res;
      }).catch(function () {
        return cache.match(req, { ignoreSearch: true }).then(function (cached) {
          if (cached || req.mode !== 'navigate') return cached;
          var scopePath = new URL(self.registration.scope).pathname;
          if (url.pathname === scopePath || url.pathname === scopePath + 'index.html') return cache.match('./');
          return new Response('Offline. This page has not been saved on this device yet; open it again with a connection.', { status: 503, headers: { 'Content-Type': 'text/plain' } });
        });
      });
    })
  );
});
