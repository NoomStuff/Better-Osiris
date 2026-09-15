// Delivery only. Scheduling still belongs to the page.
async function closeExpiredNotifications() {
   for (const notification of await self.registration.getNotifications()) {
      if (typeof notification.data?.expiresAt === "number" && notification.data.expiresAt <= Date.now()) notification.close();
   }
}
self.addEventListener("install", (event) => event.waitUntil(self.skipWaiting()));
self.addEventListener("activate", (event) => event.waitUntil(Promise.all([self.clients.claim(), closeExpiredNotifications()])));
self.addEventListener("notificationclick", (event) => {
   event.notification.close();
   event.waitUntil(
      closeExpiredNotifications()
         .then(() => self.clients.matchAll({ type: "window", includeUncontrolled: true }))
         .then(async (clients) => {
            const apps = clients.filter((client) => new URL(client.url).origin === self.location.origin);
            const app = apps.find((client) => client.visibilityState === "visible") ?? apps[0];
            if (app) {
               try {
                  return await app.focus();
               } catch {
                  /* Open a window if the old tab closed. */
               }
            }
            return self.clients.openWindow("/");
         })
   );
});
