self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {};

  const title = data.title || 'TV Show Episode Alert';
  const options = {
    body: data.body || 'A new episode is airing soon!',
    icon: data.icon || 'https://www.themoviedb.org/assets/2/v4/logos/v2/blue_square_2-d537fb228c0922bb4c1456c30d96d0c2e63eaf20f501171d3311800d3d52cb22.png',
    badge: 'https://www.themoviedb.org/assets/2/v4/logos/v2/blue_square_2-d537fb228c0922bb4c1456c30d96d0c2e63eaf20f501171d3311800d3d52cb22.png',
    vibrate: [200, 100, 200],
    data: { url: data.data?.url || '/' }
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url === targetUrl && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
