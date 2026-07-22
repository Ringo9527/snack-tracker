const CACHE_NAME = 'snack-v2';

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll([
    '/',
    '/index.html',
    '/icon.png',
    '/manifest.json'
  ])));
});

self.addEventListener('activate', e => {
  e.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', e => {
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request).catch(() => caches.match('/index.html')))
  );
});

self.addEventListener('push', e => {
  let data = {};
  try { data = e.data.json(); } catch(_) {}
  
  const title = data.title || '零食保质期提醒';
  const options = {
    body: data.body || '',
    icon: data.icon || '/icon.png',
    badge: data.badge || '/icon.png',
    data: data.data || { url: '/' },
    requireInteraction: true,
    vibrate: [200, 100, 200],
    tag: 'snack-expiry',
    actions: data.actions || []
  };

  e.waitUntil(
    self.registration.showNotification(title, options)
  );
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cls => {
      if (cls.length > 0) {
        cls[0].focus();
        cls[0].navigate(e.notification.data.url || '/');
      } else {
        clients.openWindow(e.notification.data.url || '/');
      }
    })
  );
});
