// Delivery only: no roster fetches, credential storage, push subscription, or offline cache.
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("notificationclick", (event) => {
   event.notification.close();
   event.waitUntil(
      self.clients.matchAll({ type: "window" }).then((clients) => {
         const app = clients.find((client) => new URL(client.url).origin === self.location.origin);
         return app ? app.focus() : self.clients.openWindow("/");
      })
   );
});
