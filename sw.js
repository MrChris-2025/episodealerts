self.addEventListener('push', function(event) {
  let data = { title: 'Alert', body: 'New content is available!' };
  if (event.data) { data = event.data.json(); }
  const options = {
    body: data.body,
    icon: './icon-512.png',
    badge: './icon-512.png',
    vibrate: [100, 50, 100]
  };
  event.waitUntil(self.registration.showNotification(data.title, options));
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  event.waitUntil(clients.openWindow('/'));
});
