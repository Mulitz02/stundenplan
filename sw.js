// Offline-Cache: App-Dateien lokal halten, beim Öffnen online nach Updates schauen
const CACHE = "hbc-v5";
const CORE = ["./", "index.html", "app.js", "style.css", "style.css?v=5", "manifest.webmanifest", "data/studiengaenge.json", "apple-touch-icon.png", "icon-192.png", "icon-512.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  const own = url.origin === self.location.origin;
  if (own) {
    // Netzwerk zuerst, damit Updates sofort ankommen; offline aus dem Cache
    e.respondWith(
      fetch(req).then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy));
        return res;
      }).catch(() => caches.match(req).then(r => r || caches.match("index.html")))
    );
  } else if (/fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)) {
    // Schriften: Cache zuerst
    e.respondWith(
      caches.match(req).then(r => r || fetch(req).then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy));
        return res;
      }))
    );
  }
});
