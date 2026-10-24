// アプリの全ファイルを端末に保存し、オフラインでも動くようにする。
// ファイルを更新したら VERSION を上げる(古いキャッシュが消え、新しいファイルが保存される)。

const VERSION = "v4";
const CACHE = `kawaguchi-chomei-quiz-${VERSION}`;
const FILES = [
  "./",
  "index.html",
  "style.css",
  "manifest.webmanifest",
  "data/map.json",
  "js/app.js",
  "js/map.js",
  "js/learn.js",
  "js/quiz.js",
  "js/mastery.js",
  "js/store.js",
  "vendor/leaflet/leaflet.js",
  "vendor/leaflet/leaflet.css",
  "icons/icon-180.png",
  "icons/icon-192.png",
  "icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(
    caches.match(event.request, { ignoreSearch: true }).then((hit) => hit || fetch(event.request)),
  );
});
