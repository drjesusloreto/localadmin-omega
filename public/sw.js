// public/sw.js
/**
 * Service Worker para LocalAdmin Omega.
 * 
 * Estrategia de caché:
 * - App shell: cache-first (HTML, CSS, JS).
 * - Datos de usuario: no se cachean (están en IndexedDB).
 * - Recursos externos: network-first con fallback a cache.
 * 
 * Referencia: EDC Página 280-295 + PAE Semana 6, Día 22
 */

const CACHE_NAME = 'localadmin-omega-v1';
const APP_SHELL = [
    '/',
    '/index.html',
    '/styles.css',
    '/manifest.json'
];

// ============================================================
// INSTALL: Pre-cachear el App Shell
// ============================================================
self.addEventListener('install', (event) => {
    console.log('[SW] Installing...');
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log('[SW] Caching app shell');
            return cache.addAll(APP_SHELL);
        }).then(() => self.skipWaiting())
    );
});

// ============================================================
// ACTIVATE: Limpiar caches antiguos
// ============================================================
self.addEventListener('activate', (event) => {
    console.log('[SW] Activating...');
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames
                    .filter((name) => name !== CACHE_NAME)
                    .map((name) => {
                        console.log('[SW] Deleting old cache:', name);
                        return caches.delete(name);
                    })
            );
        }).then(() => self.clients.claim())
    );
});

// ============================================================
// FETCH: Estrategia de caché
// ============================================================
self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    // No cachear peticiones a otros orígenes (ej. GAS)
    if (url.origin !== self.location.origin) {
        return;
    }

    // No cachear peticiones POST/PUT/DELETE
    if (request.method !== 'GET') {
        return;
    }

    // App shell: cache-first
    if (APP_SHELL.includes(url.pathname)) {
        event.respondWith(
            caches.match(request).then((cached) => {
                return cached || fetch(request);
            })
        );
        return;
    }

    // Otros recursos: network-first con fallback
    event.respondWith(
        fetch(request)
            .then((response) => {
                // Cachear respuesta exitosa
                if (response.ok) {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(request, clone);
                    });
                }
                return response;
            })
            .catch(() => {
                return caches.match(request);
            })
    );
});

// ============================================================
// MENSAJES: Permitir skipWaiting desde la app
// ============================================================
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});