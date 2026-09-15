import { toClassSnapshot } from "./classSnapshot";
import type { ClassSnapshot } from "../types/weeks";
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

interface PendingChange {
   scope: string;
   diff: SessionClassDiff;
   before: ClassSnapshot | null;
}
const pendingChanges = new Map<string, PendingChange>();
const notificationState = (item: ClassSnapshot | null) => JSON.stringify(item?.status === "cancelled" ? null : item);

/** Compare with the last delivered state, and combine edits still waiting for delivery. */
export async function notifyClassDiffs(diffs: SessionClassDiff[], contextId: string) {
   if (!getClassNotificationsEnabled() || getClassNotificationPermission() !== "granted" || !diffs.length) return;
   const epoch = readBrowserStorage("localStorage", SESSION_EPOCH_KEY);
   const isCurrent = () => epoch === readBrowserStorage("localStorage", SESSION_EPOCH_KEY) && getClassNotificationsEnabled();
   const scope = JSON.stringify([epoch, contextId]);
   diffs.forEach((diff) => {
      const key = JSON.stringify(["class-change", epoch, contextId, diff.schoolClass.id]);
      const previous = pendingChanges.get(key);
      pendingChanges.set(key, { scope, diff, before: previous ? previous.before : diff.previousClass ? toClassSnapshot(diff.previousClass) : null });
   });
   try {
      await runNotificationQueue(async (ledger) => {
         const keys = [...pendingChanges].filter(([, pending]) => pending.scope === scope).map(([key]) => key);
         if (!isCurrent()) {
            keys.forEach((key) => pendingChanges.delete(key));
            return;
         }
         const keyed = keys.flatMap((key) => {
            const pending = pendingChanges.get(key);
            if (!pending) return [];
            const state = notificationState(toClassSnapshot(pending.diff.schoolClass));
            if (state === (ledger.getState(key) ?? notificationState(pending.before))) {
               pendingChanges.delete(key);
               return [];
            }
            const diff: SessionClassDiff = {
               ...pending.diff,
               status: pending.diff.status === "added" && pending.before ? "changed" : pending.diff.status,
               ...(pending.before ? { previousClass: pending.before } : {}),
            };
            return [{ key, pending, state, diff }];
         });
         for (const status of ["added", "changed", "cancelled"] as const) {
            const group = keyed.filter((item) => item.diff.status === status);
            if (!group.length) continue;
            const body = getClassNotificationBodies(group.map((item) => item.diff))[0];
            const current = () => isCurrent() && group.every((item) => pendingChanges.get(item.key) === item.pending);
            if (!body || !current()) continue;
            if (!(await deliverNotification(body, `class-change:${crypto.randomUUID()}`, current))) continue;
            group.forEach((item) => {
               ledger.markDelivered(item.key, item.state);
               const latest = pendingChanges.get(item.key);
               if (latest === item.pending) pendingChanges.delete(item.key);
               else if (latest) latest.before = toClassSnapshot(item.diff.schoolClass);
            });
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
