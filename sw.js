// public/sw.js - service worker
self.addEventListener('push', function(event) {
  if (!event.data) return;
  let payload = {};
  try { payload = event.data.json(); } catch (e) { payload = { title: 'Update', body: event.data.text() }; }
  const title = payload.title || 'New Alert';
  const data = payload.data || {};
  const tag = data.episodeUniqueId || (`episode-${data.showId || 'unknown'}`);
  const options = {
    body: payload.body || '',
    data: data,
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-96.png',
    vibrate: [100,50,100],
    requireInteraction: true,
    renotify: true,
    tag: tag,
    timestamp: data && data.air_date ? Date.parse(data.air_date + "T00:00:00Z") : Date.now(),
    actions: [{ action: 'open', title: 'Open', icon: '/icons/icon-96.png' }]
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.tmdbUrl) || '/';
  event.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
    for (let client of windowClients) {
      try {
        const u = new URL(client.url);
        if (u.pathname === new URL(url, location.origin).pathname) {
          if (client.focus) return client.focus();
        }
      } catch (e) {}
    }
    if (clients.openWindow) return clients.openWindow(url);
  }));
});
