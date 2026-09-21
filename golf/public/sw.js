/*
 * Offline shell.
 *
 * Phone signal at a golf course is unreliable and the round itself lives in
 * localStorage, so the only thing between the app and a dead spot is the shell.
 *
 * Cache strategy matters more than it looks. An earlier version was cache-first
 * for everything including the HTML document, which meant a deployed update was
 * never picked up: the stale page loaded stale JavaScript, which went on calling
 * API routes that no longer existed and got back a bare 404. So:
 *
 *   - the document is network-first, with the cache as the offline fallback
 *   - hashed build assets are cache-first, since their URL changes when they do
 *   - /api/ is never cached; a stale answer is worse than no answer
 *
 * Offline still works, because every network-first path falls back to the cache.
 */

const CACHE = "onedowns-v4";
const SHELL = ["/", "/new", "/manifest.webmanifest", "/icon-192.png"];
/** Long enough for a weak signal, short enough not to feel broken. */
const NETWORK_TIMEOUT_MS = 3000;
/**
 * A reload the page asked for because a newer build is live carries ?u=<id>.
 * The network was reachable a moment ago — that is how the page found out —
 * so this one waits for it rather than settling for the very copy it is
 * trying to replace.
 */
const UPDATE_PARAM = "u";
const UPDATE_TIMEOUT_MS = 15000;

/** The marker is not part of the page's identity; cache it under the plain URL. */
function cacheKey(request) {
  const url = new URL(request.url);
  if (!url.searchParams.has(UPDATE_PARAM)) return request;
  url.searchParams.delete(UPDATE_PARAM);
  return new Request(url.toString());
}

function isUpdateReload(request) {
  return new URL(request.url).searchParams.has(UPDATE_PARAM);
}

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

function putInCache(request, response) {
  if (response && response.ok && response.type === "basic") {
    const copy = response.clone();
    caches.open(CACHE).then((cache) => cache.put(cacheKey(request), copy));
  }
  return response;
}

/** Race the network against a timer so a dead spot does not hang the page. */
function fetchWithTimeout(request, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), timeoutMs);
    fetch(request)
      .then((response) => {
        clearTimeout(timer);
        resolve(response);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

async function networkFirst(request) {
  try {
    const timeoutMs = isUpdateReload(request) ? UPDATE_TIMEOUT_MS : NETWORK_TIMEOUT_MS;
    return putInCache(request, await fetchWithTimeout(request, timeoutMs));
  } catch {
    const cached = await caches.match(cacheKey(request));
    if (cached) return cached;
    if (request.mode === "navigate") {
      const shell = await caches.match("/");
      if (shell) return shell;
    }
    return Response.error();
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    return putInCache(request, await fetch(request));
  } catch {
    return Response.error();
  }
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // Never serve a cached API answer: GHIN data and shared rounds must be live.
  if (url.pathname.startsWith("/api/")) return;

  // Build output is content-hashed, so a cached copy can never be the wrong one.
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirst(request));
    return;
  }

  event.respondWith(networkFirst(request));
});
