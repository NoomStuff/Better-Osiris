import { readBrowserStorage, writeBrowserStorage } from "./browserStorage";

const DELIVERY_LEDGER_KEY = "roster-notification-deliveries-v1";
const LEDGER_MAX_AGE_MS = 7 * 86400_000;
const LEDGER_MAX_ENTRIES = 200;

export const NOTIFICATION_DELIVERY_LEDGER_KEY = DELIVERY_LEDGER_KEY;

export interface NotificationDeliveryLedger {
   isDelivered(key: string): boolean;
   markDelivered(key: string, state?: string): void;
   getState(key: string): string | undefined;
}

/**
 * All alert kinds share a lock because they write the same delivery ledger.
 * Without Web Locks, serialize within this tab; cross-tab deduplication is best effort.
 */
let localQueue = Promise.resolve();

export async function runNotificationQueue(plan: (ledger: NotificationDeliveryLedger) => Promise<void>): Promise<void> {
   const send = async () => {
      const entries = readDeliveryLedger();
      await plan({
         isDelivered: (key) => Boolean(entries[key]),
         getState: (key) => entries[key]?.state,
         markDelivered: (key, state) => {
            Reflect.deleteProperty(entries, key);
            entries[key] = { at: Date.now(), ...(state === undefined ? {} : { state }) };
            writeBrowserStorage("localStorage", DELIVERY_LEDGER_KEY, JSON.stringify(Object.fromEntries(Object.entries(entries).slice(-LEDGER_MAX_ENTRIES))));
         },
      });
   };
   if ("locks" in navigator) await navigator.locks.request("roster-notifications", send);
   else {
      const pending = localQueue.then(send);
      localQueue = pending.catch(() => {
         // A failed delivery must not block later work.
      });
      await pending;
   }
}

/** Prefer persistent notifications so clicking an alert works after its tab closes. */
export async function deliverNotification(body: string, tag: string, isCurrent: () => boolean, expiresAt?: number): Promise<boolean> {
   const current = () => isCurrent() && (expiresAt === undefined || expiresAt > Date.now());
   if (!current()) return false;
   const options: NotificationOptions = { body, tag, requireInteraction: false, data: { expiresAt }, icon: "/favicon.svg" };
   if ("serviceWorker" in navigator) {
      try {
         const registration = await getWorkerRegistration();
         if (!current()) return false;
         await registration.showNotification("Better Osiris", options);
         if (!current()) await closeNotifications((notification) => notification.tag === tag);
         return true;
      } catch {
         // Some desktop browsers support constructor notifications even when workers fail.
      }
   }
   if (!current()) return false;
   const notification = new window.Notification("Better Osiris", options);
   notification.onclick = () => {
      notification.close();
      window.focus();
   };
   directNotifications.add(notification);
   notification.onclose = () => directNotifications.delete(notification);
   return true;
}

const directNotifications = new Set<Notification>();

/** Called on the clock and on resume. Browsers cannot guarantee cleanup while suspended. */
export async function closeNotifications(shouldClose: (notification: Notification) => boolean) {
   for (const notification of directNotifications) {
      if (shouldClose(notification)) {
         notification.close();
         directNotifications.delete(notification);
      }
   }
   if (!("serviceWorker" in navigator)) return;
   try {
      const registration = await navigator.serviceWorker.getRegistration();
      if (!registration) return;
      for (const notification of await registration.getNotifications()) {
         if (shouldClose(notification)) notification.close();
      }
   } catch {
      // Cleanup is best effort when permission was revoked or the worker is unavailable.
   }
}

export function isNotificationExpired(notification: Pick<Notification, "data">, now = Date.now()) {
   const data: unknown = notification.data;
   return typeof data === "object" && data !== null && "expiresAt" in data && typeof data.expiresAt === "number" && data.expiresAt <= now;
}

let workerRegistration: Promise<ServiceWorkerRegistration> | undefined;

function getWorkerRegistration() {
   workerRegistration ??= (async () => {
      let timeout: ReturnType<typeof setTimeout> | undefined;
      try {
         return await Promise.race([
            navigator.serviceWorker.register("/notifications-sw.js").then(async () => navigator.serviceWorker.ready),
            new Promise<never>((_, reject) => {
               timeout = setTimeout(() => reject(new Error("Notification worker did not activate")), 10_000);
            }),
         ]);
      } finally {
         clearTimeout(timeout);
      }
   })().catch((error: unknown) => {
      workerRegistration = undefined;
      throw error;
   });
   return workerRegistration;
}

interface DeliveryEntry {
   at: number;
   state?: string;
}

function readDeliveryLedger(): Record<string, DeliveryEntry> {
   try {
      const parsed: unknown = JSON.parse(readBrowserStorage("localStorage", DELIVERY_LEDGER_KEY) ?? "{}");
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
         return Object.fromEntries(
            Object.entries(parsed).filter((entry): entry is [string, DeliveryEntry] => {
               const value: unknown = entry[1];
               return (
                  typeof value === "object" &&
                  value !== null &&
                  "at" in value &&
                  typeof value.at === "number" &&
                  value.at > Date.now() - LEDGER_MAX_AGE_MS &&
                  (!("state" in value) || typeof value.state === "string")
               );
            })
         );
      }
   } catch {
      /* Corrupt delivery history must not prevent alerts. */
   }
   return {};
}
