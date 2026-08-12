// self refers to the service worker itself

// Event listener for push notifications
self.addEventListener('push', event => {
    // Check if data is present in the push event
    const data = event.data ? event.data.json() : {};
    console.log('Push received:', data);

    const title = data.title || 'New Notification';
    const options = {
        body: data.body || 'You have a new update.',
        icon: '/icons/icon-192x192.png', // Path to your app's icon
        badge: '/icons/badge-72x72.png', // Path to a badge icon (optional, for some platforms)
        data: {
            url: data.url || '/' // Default URL to open when notification is clicked
        },
        vibrate: [200, 100, 200], // Optional: Vibration pattern
    };

    // Show the notification. event.waitUntil ensures the service worker stays alive
    // until the notification is shown.
    event.waitUntil(self.registration.showNotification(title, options));
});

// Event listener for when a user clicks on a notification
self.addEventListener('notificationclick', event => {
    event.notification.close(); // Close the notification

    const urlToOpen = event.notification.data.url;

    // event.waitUntil ensures the service worker stays alive until the window is opened/focused
    event.waitUntil(
        clients.openWindow(urlToOpen) // Open the specified URL
    );
});

// Optional: Basic caching strategy for offline support (uncomment and customize if needed)
// self.addEventListener('install', (event) => {
//     console.log('Service Worker: Installing');
//     event.waitUntil(
//         caches.open('tmdb-gallery-cache-v1').then((cache) => {
//             return cache.addAll([
//                 '/',
//                 '/index.html',
//                 '/sw.js',
//                 // Add other assets here, like your icons
//                 // '/icons/icon-192x192.png',
//                 // '/icons/badge-72x72.png',
//                 // 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0-beta3/css/all.min.css',
//                 // 'https://unpkg.com/parse/dist/parse.min.js'
//             ]);
//         })
//     );
// });

// self.addEventListener('fetch', (event) => {
//     event.respondWith(
//         caches.match(event.request).then((response) => {
//             return response || fetch(event.request);
//         })
//     );
// });
