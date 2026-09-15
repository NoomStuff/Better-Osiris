import type { Class } from "../types/weeks";
import { parseLocalDateTime } from "./date";
import { readBrowserStorage } from "./browserStorage";
import { closeNotifications, isNotificationExpired, deliverNotification, runNotificationQueue } from "./notificationDelivery";
import { getClassNotificationPermission } from "./classNotifications";
import { SESSION_EPOCH_KEY } from "./sessionStore";
import { notifyWarning } from "./notyf";
export const CLASS_REMINDERS_KEY = "roster-class-reminders";
export const REMINDER_MINUTES_KEY = "roster-reminder-minutes";
export function getReminderMinutes() {
   const value = Number(readBrowserStorage("localStorage", REMINDER_MINUTES_KEY) ?? 5);
   return Number.isInteger(value) && value >= 1 && value <= 60 ? value : 5;
}
export function isClassReminderDue(item: Class, minutes: number, now: number) {
   const start = parseLocalDateTime(item.start).getTime();
   return item.status !== "cancelled" && start > now && start - minutes * 60_000 <= now;
}
/** Simultaneous classes keep their reminders; only a later start replaces them. */
export function getClassReminderExpiry(item: Class, classes: Class[], minutes: number) {
   const start = parseLocalDateTime(item.start).getTime();
   return classes.reduce((expiry, next) => {
      const nextStart = parseLocalDateTime(next.start).getTime();
      return next.status !== "cancelled" && nextStart > start ? Math.min(expiry, nextStart - minutes * 60_000) : expiry;
   }, parseLocalDateTime(item.end).getTime());
}
export function getClassReminderBody(item: Pick<Class, "title" | "room" | "start">, now: number) {
   const minutes = Math.max(1, Math.ceil((parseLocalDateTime(item.start).getTime() - now) / 60_000));
   const room = item.room.trim();
   return `${item.title} is starting in ${minutes} minute${minutes === 1 ? "" : "s"}${room ? ` in room ${room}` : ""}`;
}
let warningShown = false;
export async function notifyUpcomingClasses(classes: Class[], contextId: string, isActive: () => boolean) {
   const epoch = readBrowserStorage("localStorage", SESSION_EPOCH_KEY);
   const current = () =>
      isActive() &&
      epoch === readBrowserStorage("localStorage", SESSION_EPOCH_KEY) &&
      readBrowserStorage("localStorage", CLASS_REMINDERS_KEY) === "true" &&
      getClassNotificationPermission() === "granted";
   if (!isActive()) return;
   await closeNotifications((notification) => {
      if (!isActive()) return false;
      if (isNotificationExpired(notification)) return true;
      if (!notification.tag.startsWith("class-reminder:")) return false;
      return (
         !current() ||
         !classes.some(
            (item) =>
               notification.tag === `class-reminder:${JSON.stringify([contextId, item.id, item.start])}` &&
               item.status !== "cancelled" &&
               getClassReminderExpiry(item, classes, getReminderMinutes()) > Date.now()
         )
      );
   });
   if (!current()) return;
   try {
      await runNotificationQueue(async (ledger) => {
         for (const item of classes) {
            const key = JSON.stringify([contextId, item.id, item.start]);
            const due = () => current() && isClassReminderDue(item, getReminderMinutes(), Date.now());
            if (ledger.isDelivered(key) || !due()) continue;
            const body = getClassReminderBody(item, Date.now());
            if (!(await deliverNotification(body, `class-reminder:${key}`, due, getClassReminderExpiry(item, classes, getReminderMinutes())))) continue;
            ledger.markDelivered(key);
         }
      });
   } catch {
      if (!warningShown) {
         warningShown = true;
         notifyWarning("This browser could not deliver a class reminder.");
      }
   }
}
