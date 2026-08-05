const CACHE_NAME = "zenlist-cache-v2";

// Arquivos de código: sempre busca a versão mais nova da rede primeiro
// (evita servir uma versão antiga em cache depois que você edita o código).
const NETWORK_FIRST_ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./manifest.json",
  "./firebase-config.js"
];

// Ícones e imagens: raramente mudam, então cache-primeiro é seguro e mais rápido.
const CACHE_FIRST_ASSETS = [
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png",
  "./icons/favicon-32.png",
  "./icons/apple-touch-icon.png",
  "./icons/flower-mark.png",
  "./icons/logo-mark.png",
  "./icons/stickers/sticker-grumpy.png",
  "./icons/stickers/sticker-painter.png",
  "./icons/stickers/sticker-party.png",
  "./icons/stickers/sticker-gamer.png",
  "./icons/stickers/sticker-rainy.png",
  "./icons/stickers/sticker-playful.png",
  "./icons/stickers/sticker-reading.png"
];

const ASSETS = NETWORK_FIRST_ASSETS.concat(CACHE_FIRST_ASSETS);

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

function isNetworkFirst(url) {
  return NETWORK_FIRST_ASSETS.some((path) => url.endsWith(path.replace("./", "/")) || url.endsWith(path));
}

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  var url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return; // deixa CDNs externos (Firebase) seguirem o fluxo normal do navegador

  var networkFirst = isNetworkFirst(url.pathname) || url.pathname === "/" || url.pathname.endsWith("/index.html");

  if (networkFirst) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request)
        .then((response) => {
          if (response && response.status === 200 && response.type === "basic") {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => cached);
    })
  );
});
