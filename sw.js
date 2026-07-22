const CACHE_NAME = 'snack-v3';

// 只缓存静态资源，不缓存 HTML
self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll([
    '/icon.png',
    '/manifest.json'
  ])));
});

// 清除旧缓存
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
    ))
  );
  e.waitUntil(self.clients.claim());
});

// HTML 走网络优先，其他资源走缓存
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  // HTML 文档：网络优先，失败才用缓存
  if (e.request.mode === 'navigate' || url.pathname.endsWith('.html') || url.pathname === '/') {
    e.respondWith(
      fetch(e.request).catch(() => caches.match(e.request))
    );
    return;
  }
  // 静态资源：缓存优先
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request))
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

  e.waitUntil(self.registration.showNotification(title, options));
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
