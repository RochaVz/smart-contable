// Service worker mínimo: solo habilita la instalación como PWA
// ("Agregar a pantalla de inicio"). No cachea ni intercepta peticiones
// a la API para evitar mostrar datos contables desactualizados.
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', () => {
  // Sin caché: cada solicitud va siempre a la red.
});
