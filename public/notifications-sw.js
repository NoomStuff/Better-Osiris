// Notification scheduling belongs to the page. The build supplies offlineShell for public assets only.
async function closeExpiredNotifications() {
   for (const notification of await self.registration.getNotifications()) {
      if (typeof notification.data?.expiresAt === "number" && notification.data.expiresAt <= Date.now()) notification.close();
   }
}
self.addEventListener("install", (event) => {
   if (!self.offlineShell) {
      event.waitUntil(self.skipWaiting());
      return;
   }
   // Do not replace a running version until its tabs close. Its HTML and hashed files stay together.
   event.waitUntil(
      caches
         .open(self.offlineShell.cache)
         .then((cache) => cache.addAll(self.offlineShell.urls.map((url) => new Request(url, { credentials: "omit", cache: "reload" }))))
   );
});
self.addEventListener("activate", (event) =>
   event.waitUntil(
      Promise.all([
         self.clients.claim(),
         closeExpiredNotifications(),
         self.offlineShell
            ? caches
                 .keys()
                 .then((keys) =>
                    Promise.all(keys.filter((key) => key.startsWith("osiris-shell-") && key !== self.offlineShell.cache).map((key) => caches.delete(key)))
                 )
            : Promise.resolve(),
      ])
   )
);
self.addEventListener("fetch", (event) => {
   if (!self.offlineShell || event.request.method !== "GET") return;
   const url = new URL(event.request.url);
   if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;
   if (event.request.mode === "navigate") {
      event.respondWith(
         fetch(event.request).catch(async () => {
            const cache = await caches.open(self.offlineShell.cache);
            return (await cache.match("/")) ?? new Response("The saved app is unavailable. Reconnect and reload.", { status: 503 });
         })
      );
   } else if (self.offlineShell.urls.includes(url.pathname)) {
      event.respondWith(caches.open(self.offlineShell.cache).then(async (cache) => (await cache.match(url.pathname)) ?? fetch(event.request)));
   }
});
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
