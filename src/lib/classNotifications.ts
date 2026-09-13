import { dayLabel, parseLocalDateTime, timeLabel } from "./date";
import type { SessionClassDiff } from "./classDiffs";
import { notifyWarning } from "./notyf";
import { readBrowserStorage, writeBrowserStorage } from "./browserStorage";
import { deliverNotification, runNotificationQueue } from "./notificationDelivery";
import { SESSION_EPOCH_KEY } from "./sessionStore";

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

let deliveryWarningShown = false;

async function digest(value: unknown) {
   const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(value)));
   return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** The page detects changes. The worker only provides notification delivery on mobile. */
export async function notifyClassDiffs(diffs: SessionClassDiff[], contextId: string) {
   if (!getClassNotificationsEnabled() || getClassNotificationPermission() !== "granted" || !diffs.length) return;
   const epoch = readBrowserStorage("localStorage", SESSION_EPOCH_KEY);
   const isCurrent = () => epoch === readBrowserStorage("localStorage", SESSION_EPOCH_KEY) && getClassNotificationsEnabled();
   try {
      await runNotificationQueue("class-changes", async (ledger) => {
         const keyed = await Promise.all(
            diffs.map(async (diff) => {
               const { previous: _previous, ...current } = diff.schoolClass;
               return { diff, key: await digest([contextId, current]) };
            })
         );
         for (const status of ["added", "changed", "cancelled"] as const) {
            const group = keyed.filter((item) => item.diff.status === status && !ledger.isDelivered(item.key));
            if (!group.length) continue;
            const body = getClassNotificationBodies(group.map((item) => item.diff))[0];
            if (!body || !isCurrent()) return;
            const tag = await digest(group.map((item) => item.key).sort());
            if (!(await deliverNotification(body, tag, isCurrent))) return;
            group.forEach((item) => ledger.markDelivered(item.key));
         }
      });
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
