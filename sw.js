/* Offline cache for the trip map. Bump VERSION when index.html or local assets change. */
const VERSION = "20261006";
const CACHE = "coastal-trip-" + VERSION;
const ASSETS = [
  "./",
  "./index.html",
  "./gas-prices.js",
  "./gas-prices.js?v=9",
  "./rest-areas.js",
  "./rest-areas.js?v=1",
  "./favicon.svg",
  "./favicon.ico",
  "./icon-192.png",
  "./icon-512.png",
  "./manifest.webmanifest",
  "./signal/deadzones-att.geojson",
  "./signal/deadzones-att.geojson?v=20251231-1",
  "./signal/deadzones-vzw.geojson",
  "./signal/deadzones-vzw.geojson?v=20251231-1",
  "./signal/deadzones-tmo.geojson",
  "./signal/deadzones-tmo.geojson?v=20251231-1"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  let url;
  try { url = new URL(req.url); } catch (e) { return; }
  if (url.origin !== self.location.origin) return;
  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then((hit) => {
      if (hit) return hit;
      return fetch(req).then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(req, copy)).catch(() => {});
        }
        return res;
      }).catch(() => caches.match("./index.html"));
    })
  );
});
