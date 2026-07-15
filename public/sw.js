// sw.js — service worker. Two jobs:
// 1) Makes the app installable ("Add to Home Screen") and lets it open
//    without the browser address bar.
// 2) Receives push notifications (sent from our backend via web-push)
//    and shows them, even when the app isn't open.

const CACHE_NAME = "asbab-abaya-v1";

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// Shows the notification sent from our backend (notifyAll in push.js
// sends { title, body, group }).
self.addEventListener("push", (event) => {
  let data = { title: "Asbab Abaya", body: "নতুন একটা আপডেট এসেছে" };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch (err) {
    // ignore malformed payloads — falls back to the default text above
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      data: { group: data.group || null },
    })
  );
});

// Tapping a notification focuses an already-open tab if there is one,
// otherwise opens a new one.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow("/");
    })
  );
});
