self.addEventListener('push', function(event) {
    const data = event.data.json();
    const options = {
        body: data.body,
        icon: data.icon,
        // you can add more options here
    };

    event.waitUntil(
        self.registration.showNotification(data.title, options)
    );
});
