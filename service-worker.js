self.addEventListener('push', function(event) {
    const data = event.data.json();
    const options = {
        body: data.body,
        icon: data.icon, // Make sure to host an icon image
        badge: data.badge // Optional: for Android home screens
    };

    event.waitUntil(
        self.registration.showNotification(data.title, options)
    );
});

// Optional: handle notification clicks
self.addEventListener('notificationclick', function(event) {
    event.notification.close();
    // Example: focus or open a window
    event.waitUntil(
        clients.openWindow('https://yourapp.com') // Replace with your app's URL
    );
});```
