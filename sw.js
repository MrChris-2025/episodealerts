self.addEventListener('push', function(event) {
  const data = event.data ? event.data.json() : { title: 'Alert', body: 'New Episode!' };
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/icon-512.png',
      vibrate: [200, 100, 200]
    })
  );
});
self.addEventListener('notificationclick', e => { e.notification.close(); e.waitUntil(clients.openWindow('/')); });
