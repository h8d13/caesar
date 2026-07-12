// Service worker: Web Push receiver. Payload is always generic (the
// server never puts message content in a push, see queues/web-push),
// so this only unwraps title/body and focuses the app on click.

self.addEventListener('install', () => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
    let data = {};

    try {
        data = event.data ? event.data.json() : {};
    } catch {
        // non-JSON payload: fall through to defaults
    }

    event.waitUntil(
        self.registration.showNotification(data.title || 'New message', {
            body: data.body || 'You have a new message.',
            icon: '/logo.png',
            badge: '/logo.png'
        })
    );
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();

    event.waitUntil(
        self.clients
            .matchAll({ type: 'window', includeUncontrolled: true })
            .then((windows) => {
                for (const client of windows) {
                    if ('focus' in client) return client.focus();
                }

                return self.clients.openWindow('/');
            })
    );
});
