import { dayLabel, parseLocalDateTime, timeLabel } from "./date";
import type { SessionClassDiff } from "./classDiffs";
import { notifyWarning } from "./notyf";
import { readBrowserStorage, writeBrowserStorage } from "./browserStorage";

let permissionRequest: Promise<NotificationPermission> | null = null;
export const CLASS_NOTIFICATIONS_STORAGE_KEY = "roster-class-notifications";

export type ClassNotificationPermission = NotificationPermission | "unsupported";

export function getClassNotificationPermission(): ClassNotificationPermission {
   return typeof window === "undefined" || !("Notification" in window) ? "unsupported" : window.Notification.permission;
}

export function getClassNotificationsEnabled() {
   return readBrowserStorage("localStorage", CLASS_NOTIFICATIONS_STORAGE_KEY) === "true";
}

export function setClassNotificationsEnabled(enabled: boolean) {
   writeBrowserStorage("localStorage", CLASS_NOTIFICATIONS_STORAGE_KEY, String(enabled));
}

export async function requestNotificationPermission(): Promise<ClassNotificationPermission> {
   const permission = getClassNotificationPermission();
   if (permission !== "default") {
      return permission;
   }

   permissionRequest ??= window.Notification.requestPermission().catch(() => "default");
   try {
      return await permissionRequest;
   } finally {
      permissionRequest = null;
   }
}

const DELIVERY_KEY = "roster-notification-deliveries-v1";
let deliveryWarningShown = false;
let workerRegistration: Promise<ServiceWorkerRegistration> | undefined;

async function digest(value: unknown) {
   const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(value)));
   return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
function stillCurrent(epoch: string | null) {
   return epoch === readBrowserStorage("localStorage", "roster-session-epoch-v1") && getClassNotificationsEnabled();
}
async function deliver(body: string, tag: string, epoch: string | null) {
   if (!stillCurrent(epoch)) return false;
   try {
      new window.Notification("Better Osiris", { body, tag });
   } catch {
      if (!("serviceWorker" in navigator)) throw new Error("Notification delivery unavailable");
      workerRegistration ??= navigator.serviceWorker.register("/notifications-sw.js").then(async () => navigator.serviceWorker.ready);
      let timeout: ReturnType<typeof setTimeout> | undefined;
      try {
         const registration = await Promise.race([
            workerRegistration,
            new Promise<never>((_, reject) => {
               timeout = setTimeout(() => reject(new Error("Notification worker did not activate")), 10_000);
            }),
         ]);
         if (!stillCurrent(epoch)) return false;
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
function readDeliveryLedger(): Record<string, number> {
   try {
      const parsed: unknown = JSON.parse(readBrowserStorage("localStorage", DELIVERY_KEY) ?? "{}");
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
         return Object.fromEntries(
            Object.entries(parsed).filter((entry): entry is [string, number] => typeof entry[1] === "number" && entry[1] > Date.now() - 7 * 86400_000)
         );
      }
   } catch {
      /* Corrupt delivery history must not prevent alerts. */
   }
   return {};
}
/** The page detects changes. The worker only provides notification delivery on mobile. */
export async function notifyClassDiffs(diffs: SessionClassDiff[], contextId: string) {
   if (!getClassNotificationsEnabled() || getClassNotificationPermission() !== "granted" || !diffs.length) return;
   const epoch = readBrowserStorage("localStorage", "roster-session-epoch-v1");
   const send = async () => {
      const ledger = readDeliveryLedger();
      const keyed = await Promise.all(
         diffs.map(async (diff) => {
            const { previous: _previous, ...current } = diff.schoolClass;
            return { diff, key: await digest([contextId, current]) };
         })
      );
      for (const status of ["added", "changed", "cancelled"] as const) {
         const group = keyed.filter((item) => item.diff.status === status && !ledger[item.key]);
         if (!group.length) continue;
         const body = getClassNotificationBodies(group.map((item) => item.diff))[0];
         if (!body || !stillCurrent(epoch)) return;
         const tag = await digest(group.map((item) => item.key).sort());
         if (!(await deliver(body, tag, epoch))) return;
         group.forEach((item) => {
            ledger[item.key] = Date.now();
         });
         writeBrowserStorage("localStorage", DELIVERY_KEY, JSON.stringify(Object.fromEntries(Object.entries(ledger).slice(-200))));
      }
   };
   try {
      if ("locks" in navigator) await navigator.locks.request("roster-notifications", send);
      else await send();
   } catch {
      if (!deliveryWarningShown) {
         deliveryWarningShown = true;
         notifyWarning("This browser could not deliver a class-change notification.");
      }
   }
}

export function getClassNotificationBodies(diffs: SessionClassDiff[]) {
   const added = diffs.filter((diff) => diff.status === "added");
   const cancelled = diffs.filter((diff) => diff.status === "cancelled");
   const changed = diffs.filter((diff) => diff.status === "changed");

   return [formatDiffGroup(added, "added"), formatDiffGroup(cancelled, "cancelled"), formatDiffGroup(changed, "changed")].filter(
      (body): body is string => body !== null
   );
}

function formatDiffGroup(diffs: SessionClassDiff[], status: DiffNotificationStatus) {
   const firstDiff = diffs[0];
   if (!firstDiff) {
      return null;
   }

   return diffs.length === 1 ? formatSingleDiff(firstDiff) : `${diffs.length} classes were ${status}`;
}

type DiffNotificationStatus = "added" | "changed" | "cancelled";

function formatSingleDiff(diff: SessionClassDiff) {
   const schoolClass = diff.schoolClass;
   const previous = diff.previousClass;

   if (diff.status === "added") {
      const start = parseLocalDateTime(schoolClass.start);
      return `${schoolClass.title} was added: ${dayLabel.format(start)} ${timeLabel.format(start)}`;
   }

   if (diff.status === "cancelled") {
      const start = parseLocalDateTime(schoolClass.start);
      return `${schoolClass.title} was cancelled: ${dayLabel.format(start)} ${timeLabel.format(start)}`;
   }

   if (!previous) {
      return `${schoolClass.title} was changed`;
   }

   const detailChange =
      getTextChange(previous.room, schoolClass.room) ??
      getTimeChange(previous.start, previous.end, schoolClass.start, schoolClass.end) ??
      getTextChange(previous.location, schoolClass.location) ??
      getTextChange(previous.teacher, schoolClass.teacher) ??
      getTextChange(previous.title, schoolClass.title) ??
      getTextChange(previous.subject, schoolClass.subject) ??
      getTextChange(previous.description, schoolClass.description);

   return detailChange ? `${schoolClass.title} changed: ${detailChange}` : `${schoolClass.title} was changed`;
}

function getTextChange(previous: string, next: string) {
   return previous === next ? null : `${previous || "Not set"} → ${next || "Not set"}`;
}

function getTimeChange(previousStart: string, previousEnd: string, nextStart: string, nextEnd: string) {
   if (previousStart === nextStart && previousEnd === nextEnd) {
      return null;
   }

   const formatRange = (startValue: string, endValue: string) => {
      const start = parseLocalDateTime(startValue);
      const end = parseLocalDateTime(endValue);
      return `${dayLabel.format(start)} ${timeLabel.format(start)}–${timeLabel.format(end)}`;
   };

   return `${formatRange(previousStart, previousEnd)} → ${formatRange(nextStart, nextEnd)}`;
}
