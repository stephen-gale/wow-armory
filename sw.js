// Minimal service worker — exists mainly to satisfy PWA installability
// (Chrome requires a registered service worker with a fetch handler before
// it will offer "Install app"). Network-first: always prefers a fresh
// response when online (important since characters.json changes on every
// backup run), falling back to the cached app shell only when offline.
const CACHE_NAME = "wow-armory-shell-v1";
const SHELL_FILES = ["./", "./index.html", "./app.js", "./style.css", "./manifest.json"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_FILES))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
