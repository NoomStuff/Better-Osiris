import { dayLabel, parseLocalDateTime, timeLabel } from "./date";
import type { SessionClassDiff } from "./classDiffs";
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

export function notifyClassDiffs(diffs: SessionClassDiff[]) {
   if (!getClassNotificationsEnabled() || getClassNotificationPermission() !== "granted") {
      return;
   }

   getClassNotificationBodies(diffs).forEach((body) => {
      try {
         new window.Notification("Better Osiris", { body });
      } catch {
         // Notification support varies between browsers and operating systems.
      }
   });
}

export function getClassNotificationBodies(diffs: SessionClassDiff[]) {
   const cancelled = diffs.filter((diff) => diff.status === "cancelled");
   const changed = diffs.filter((diff) => diff.status === "changed");

   return [formatDiffGroup(cancelled, "cancelled"), formatDiffGroup(changed, "changed")].filter((body): body is string => body !== null);
}

function formatDiffGroup(diffs: SessionClassDiff[], status: "changed" | "cancelled") {
   const firstDiff = diffs[0];
   if (!firstDiff) {
      return null;
   }

   return diffs.length === 1 ? formatSingleDiff(firstDiff) : `${diffs.length} classes were ${status === "cancelled" ? "cancelled" : "changed"}`;
}

function formatSingleDiff(diff: SessionClassDiff) {
   const schoolClass = diff.schoolClass;
   const previous = diff.previousClass;

   if (diff.status === "cancelled") {
      const start = parseLocalDateTime(schoolClass.start);
      return `${schoolClass.title} was cancelled: ${dayLabel.format(start)} ${timeLabel.format(start)}`;
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
