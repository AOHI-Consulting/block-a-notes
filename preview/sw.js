/* Check-in works offline once it has been opened: the app's files and the course packs are kept in a
   cache on the device. The page itself and the course files are fetched fresh when there's a
   connection (so new classes and new versions arrive at once) and come from the cache when there
   isn't; the scripts carry their version in the address (?v=), so a cached copy is always the right
   one. Calls to the notes server (another address) are never cached. */
const CACHE = "check-in-1";
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
  await self.clients.claim();
})()));
// fresh when online, the cached copy when not
async function fresh(req, key) {
  const c = await caches.open(CACHE);
  try {
    const r = await fetch(req);
    if (r.ok) c.put(key || req, r.clone());
    return r;
  } catch (err) {
    const hit = await c.match(key || req, { ignoreSearch: !key && req.mode === "navigate" });
    if (hit) return hit;
    throw err;
  }
}
// the cached copy when there is one (versioned files), else fetched and kept
async function kept(req) {
  const c = await caches.open(CACHE), hit = await c.match(req);
  if (hit) return hit;
  const r = await fetch(req);
  if (r.ok) c.put(req, r.clone());
  return r;
}
self.addEventListener("fetch", (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== "GET") return;
  const fonts = /^https:\/\/fonts\.(googleapis|gstatic)\.com$/.test(url.origin);
  if (url.origin !== self.location.origin && !fonts) return;   // the notes server: never cached
  if (req.mode === "navigate") { e.respondWith(fresh(req, new URL("./", self.registration.scope).href)); return; }
  if (/\.(enc|json)$/.test(url.pathname) || url.pathname.endsWith("manifest.webmanifest")) { e.respondWith(fresh(req)); return; }
  e.respondWith(kept(req));
});
