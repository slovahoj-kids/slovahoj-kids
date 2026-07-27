// sw.js — Service Worker for SlovAhoj Kids real push notifications.
// Must live at the site root (not inside /api) so its scope covers the
// whole origin. Handles two things: showing a notification when a push
// arrives (even if no tab is open), and focusing/opening the site when the
// notification is tapped.

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: 'SlovAhoj Kids', body: event.data ? event.data.text() : '' };
  }

  const title = data.title || 'SlovAhoj Kids';
  const options = {
    body: data.body || 'Час позайматися словацькою! 📚',
    icon: 'tutor_girl.png',
    badge: 'tutor_girl.png',
    tag: 'slovahoj-reminder',
    data: { url: data.url || '/' },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});
