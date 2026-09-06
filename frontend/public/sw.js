const APP_VERSION = '2026.09.06.01';
const CACHE_NAME = `smartcontable-app-${APP_VERSION}`;
const APP_SHELL = ['/', '/index.html', '/manifest.webmanifest', '/favicon.svg?v=2026.09.06.01'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key.startsWith('smartcontable-app-') && key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'GET_VERSION') {
    event.source?.postMessage({ type: 'APP_VERSION', version: APP_VERSION });
  }
});

self.addEventListener('fetch', (event) => {
  const requestUrl = new URL(event.request.url);

  if (
    requestUrl.pathname.startsWith('/src/')
    || requestUrl.pathname.startsWith('/node_modules/')
    || requestUrl.pathname.startsWith('/@vite')
    || requestUrl.pathname.startsWith('/@react-refresh')
    || requestUrl.searchParams.has('t')
  ) {
    return;
  }

  if (requestUrl.pathname.startsWith('/api/') || event.request.method !== 'GET') {
    return;
  }

  if (requestUrl.origin !== self.location.origin) {
    return;
  }

  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .catch(() => caches.match('/index.html'))
    );
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const responseCopy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseCopy));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
