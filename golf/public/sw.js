/*
 * Offline shell.
 *
 * Phone signal at a golf course is unreliable, and the round data already lives
 * in localStorage, so the only thing standing between the app and a dead spot
 * is the shell itself. Same-origin GETs are served from the cache and refreshed
 * in the background; /api/ is never cached, since a stale GHIN answer is worse
 * than no answer.
 */

const CACHE = "golfbets-v1";
const SHELL = ["/", "/new", "/manifest.webmanifest", "/icon-192.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      // A failed precache must not block activation.
      .then((cache) => cache.addAll(SHELL).catch(() => undefined))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response && response.ok && response.type === "basic") {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached);

      // Cache first so a dead spot still renders, network in the background.
      return (
        cached ||
        network.catch(() =>
          request.mode === "navigate" ? caches.match("/") : Response.error(),
        )
      );
    }),
  );
});
