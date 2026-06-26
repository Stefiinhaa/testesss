/**
 * Service Worker básico para suporte offline PWA.
 *
 * Estratégia:
 * - Durante a instalação fazemos cache de um conjunto de ativos essenciais
 *   (shell da aplicação). Se um asset falhar, os demais ainda serão cacheados.
 * - No `fetch` tentamos primeiro a rede e, em falha, recorremos ao cache
 *   (network-first). Esta estratégia mantém o conteúdo atualizado enquanto
 *   fornece uma experiência offline básica.
 *
 * Observação: atualize `CACHE_NAME` ao publicar alterações que requeiram
 * recache (ex: mudança em `login.html` ou `login.js`).
 */
const STATIC_CACHE_NAME = 'v4-static-cache';
const RUNTIME_CACHE_NAME = 'v4-runtime-cache';
const OFFLINE_DOCUMENT = '/offline.html';

const ASSETS = [
  '/',
  '/index.html',
  OFFLINE_DOCUMENT,
  '/style.css',
  '/toastify.css',
  '/toastify-lib.js',
  '/frontend-common.js',
  '/manifest.json',
  '/full-educa-icone.svg',
  '/login.js',
  '/login.html',
  '/forgot-password.js',
  '/forgot-password.html',
  '/register.js',
  '/register.html',
  '/reset-password.js',
  '/reset-password.html'
];

const isCacheableResponse = (response) => response && response.ok && response.type !== 'opaque';

const isSameOriginGet = (request) => request.method === 'GET' && new URL(request.url).origin === self.location.origin;

const isApiRequest = (request) => new URL(request.url).pathname.startsWith('/api/');

const isNavigationRequest = (request) => request.mode === 'navigate';

const cleanOldCaches = async () => {
  const keys = await caches.keys();
  await Promise.all(
    keys
      .filter((key) => ![STATIC_CACHE_NAME, RUNTIME_CACHE_NAME].includes(key))
      .map((key) => caches.delete(key))
  );
};

const cacheStaticAssets = async () => {
  const cache = await caches.open(STATIC_CACHE_NAME);
  await Promise.all(
    ASSETS.map((url) => cache.add(url).catch((error) => console.error(`Falha ao cachear: ${url}`, error)))
  );
};

const serveNavigation = async (request) => {
  try {
    const networkResponse = await fetch(request);
    if (isCacheableResponse(networkResponse)) {
      const cache = await caches.open(RUNTIME_CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    const cachedResponse = await caches.match(request);
    if (cachedResponse) return cachedResponse;
    return caches.match(OFFLINE_DOCUMENT);
  }
};

const serveSameOriginGet = async (request) => {
  try {
    const networkResponse = await fetch(request);
    if (isCacheableResponse(networkResponse)) {
      const cache = await caches.open(isApiRequest(request) ? RUNTIME_CACHE_NAME : STATIC_CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    const cachedResponse = await caches.match(request);
    if (cachedResponse) return cachedResponse;
    if (request.headers.get('accept')?.includes('text/html')) {
      return caches.match(OFFLINE_DOCUMENT);
    }
    throw error;
  }
};

// Ativa nova versão e remove caches antigos
self.addEventListener('activate', (event) => {
  event.waitUntil(
    cleanOldCaches().then(() => self.clients.claim())
  );
});

self.addEventListener('install', (event) => {
  event.waitUntil(cacheStaticAssets());
  self.skipWaiting(); // Força a ativação da nova versão imediatamente
});

self.addEventListener('fetch', (event) => {
  if (!isSameOriginGet(event.request)) return;

  if (isNavigationRequest(event.request)) {
    event.respondWith(serveNavigation(event.request));
    return;
  }

  event.respondWith(serveSameOriginGet(event.request));
});
