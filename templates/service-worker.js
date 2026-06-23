const CACHE_NAME = "nexo-v4";
const STATIC_ASSETS = [
    "/manifest.json",
    "/static/css/app.css?v=20260621a",
    "/static/js/app.js?v=20260513a",
    "/static/icons/favicon.png?v=20260323d",
    "/static/icons/icon-192.png?v=20260323d",
    "/static/icons/icon-512.png?v=20260323d",
];

self.addEventListener("install", (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(STATIC_ASSETS);
        })
    );
    self.skipWaiting();
});

self.addEventListener("activate", (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames
                    .filter((cacheName) => cacheName !== CACHE_NAME)
                    .map((cacheName) => caches.delete(cacheName))
            );
        })
    );
    self.clients.claim();
});

self.addEventListener("fetch", (event) => {
    if (event.request.method !== "GET") {
        return;
    }

    const url = new URL(event.request.url);
    if (url.origin !== self.location.origin) {
        return;
    }

    const isStaticRequest =
        url.pathname.startsWith("/static/") || url.pathname === "/manifest.json";

    if (isStaticRequest) {
        event.respondWith(
            caches.match(event.request).then((cachedResponse) => {
                if (cachedResponse) {
                    return cachedResponse;
                }

                return fetch(event.request).then((networkResponse) => {
                    if (networkResponse && networkResponse.status === 200) {
                        const responseClone = networkResponse.clone();
                        caches.open(CACHE_NAME).then((cache) => {
                            cache.put(event.request, responseClone);
                        });
                    }
                    return networkResponse;
                });
            })
        );
        return;
    }

    // Dynamic HTML/routes: always network-first to keep balances current.
    event.respondWith(fetch(event.request));
});
