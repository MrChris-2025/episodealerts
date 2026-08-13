self.addEventListener('push', function(event) {
  let data = { title: 'New Alert', body: 'New content is available!' };
  
  if (event.data) {
    data = event.data.json();
  }

  const options = {
    body: data.body,
    icon: 'https://via.placeholder.com/128/09f/fff.png',
    badge: 'https://via.placeholder.com/128/09f/fff.png',
    vibrate: [200, 100, 200]
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  event.waitUntil(
    clients.openWindow('/')
  );
});
