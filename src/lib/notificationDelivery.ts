import { readBrowserStorage, writeBrowserStorage } from "./browserStorage";

const DELIVERY_LEDGER_KEY = "roster-notification-deliveries-v1";
const LEDGER_MAX_AGE_MS = 7 * 86400_000;
const LEDGER_MAX_ENTRIES = 200;

export const NOTIFICATION_DELIVERY_LEDGER_KEY = DELIVERY_LEDGER_KEY;

export interface NotificationDeliveryLedger {
   isDelivered(key: string): boolean;
   markDelivered(key: string): void;
}

/**
 * Runs one notification queue: a browser lock serializes planning across tabs and a shared
 * ledger suppresses redelivery for a week. A queue plans its deliveries against the ledger
 * inside the lock, so two tabs can never deliver the same item twice. Adding a notification
 * kind means building its deliveries in a plan callback; storage, locking and delivery here.
 */
export async function runNotificationQueue(queue: string, plan: (ledger: NotificationDeliveryLedger) => Promise<void>): Promise<void> {
   const send = async () => {
      const entries = readDeliveryLedger();
      await plan({
         isDelivered: (key) => Boolean(entries[key]),
         markDelivered: (key) => {
            entries[key] = Date.now();
            writeBrowserStorage("localStorage", DELIVERY_LEDGER_KEY, JSON.stringify(Object.fromEntries(Object.entries(entries).slice(-LEDGER_MAX_ENTRIES))));
         },
      });
   };
   if ("locks" in navigator) await navigator.locks.request(`roster-notifications:${queue}`, send);
   else await send();
}

/** Shows a notification directly, falling back to the service worker where constructor notifications are unavailable. */
export async function deliverNotification(body: string, tag: string, isCurrent: () => boolean): Promise<boolean> {
   if (!isCurrent()) return false;
   try {
      new window.Notification("Better Osiris", { body, tag });
   } catch {
      if (!("serviceWorker" in navigator)) throw new Error("Notification delivery unavailable");
      let timeout: ReturnType<typeof setTimeout> | undefined;
      try {
         const registration = await Promise.race([
            getWorkerRegistration(),
            new Promise<never>((_, reject) => {
               timeout = setTimeout(() => reject(new Error("Notification worker did not activate")), 10_000);
            }),
         ]);
         if (!isCurrent()) return false;
         await registration.showNotification("Better Osiris", { body, tag });
      } catch (error) {
         workerRegistration = undefined;
         throw error;
      } finally {
         clearTimeout(timeout);
      }
   }
   return true;
}

let workerRegistration: Promise<ServiceWorkerRegistration> | undefined;

function getWorkerRegistration() {
   workerRegistration ??= navigator.serviceWorker.register("/notifications-sw.js").then(async () => navigator.serviceWorker.ready);
   return workerRegistration;
}

function readDeliveryLedger(): Record<string, number> {
   try {
      const parsed: unknown = JSON.parse(readBrowserStorage("localStorage", DELIVERY_LEDGER_KEY) ?? "{}");
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
         return Object.fromEntries(
            Object.entries(parsed).filter((entry): entry is [string, number] => typeof entry[1] === "number" && entry[1] > Date.now() - LEDGER_MAX_AGE_MS)
         );
      }
   } catch {
      /* Corrupt delivery history must not prevent alerts. */
   }
   return {};
}
