// public/sw.js
/**
 * Service Worker para LocalAdmin Omega.
 * 
 * Estrategia de caché:
 * - App shell: cache-first (solo en producción).
 * - Datos de usuario: no se cachean (están en IndexedDB).
 * - Recursos externos: network-first con fallback a cache.
 * 
 * IMPORTANTE: Este SW solo debe activarse en producción.
 * En desarrollo, Vite maneja el HMR y no queremos interferir.
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
// FETCH: Estrategia de caché robusta
// ============================================================
self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    // ⬇️ NO interceptar peticiones fuera de nuestro origen
    if (url.origin !== self.location.origin) {
        return;
    }

    // ⬇️ NO interceptar métodos que no sean GET
    if (request.method !== 'GET') {
        return;
    }

    // ⬇️ NO interceptar recursos de Vite en desarrollo
    // (Vite HMR usa WebSocket y endpoints propios)
    if (url.pathname.startsWith('/@vite/') ||
        url.pathname.startsWith('/@react-refresh') ||
        url.pathname.startsWith('/node_modules/') ||
        url.pathname.startsWith('/src/') ||
        url.pathname.includes('?v=') ||
        url.pathname.includes('?t=')) {
        return;
    }

    // ⬇️ NO interceptar si es un navigation request (el navegador lo maneja)
    if (request.mode === 'navigate') {
        event.respondWith(
            fetch(request).catch(() => {
                return caches.match('/index.html').then((cached) => {
                    return cached || new Response('Offline', {
                        status: 503,
                        statusText: 'Service Unavailable',
                        headers: { 'Content-Type': 'text/plain' }
                    });
                });
            })
        );
        return;
    }

    // ⬇️ Estrategia cache-first con fallback robusto
    event.respondWith(
        caches.match(request).then((cached) => {
            if (cached) {
                return cached;
            }
            return fetch(request).then((response) => {
                // Solo cachear respuestas exitosas
                if (!response || response.status !== 200 || response.type === 'opaque') {
                    return response;
                }
                // Clonar y cachear
                const responseToCache = response.clone();
                caches.open(CACHE_NAME).then((cache) => {
                    cache.put(request, responseToCache);
                });
                return response;
            }).catch(() => {
                // Fallback: si es un recurso crítico, servir el App Shell
                return caches.match('/index.html').then((fallback) => {
                    return fallback || new Response('Recurso no disponible offline', {
                        status: 503,
                        statusText: 'Service Unavailable',
                        headers: { 'Content-Type': 'text/plain' }
                    });
                });
            });
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