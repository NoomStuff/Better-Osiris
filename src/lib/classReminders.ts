import type { Class } from "../types/weeks";
import { parseLocalDateTime } from "./date";
import { readBrowserStorage, writeBrowserStorage } from "./browserStorage";
import { deliverClassNotification, getClassNotificationPermission } from "./classNotifications";
import { notifyWarning } from "./notyf";
export const CLASS_REMINDERS_KEY = "roster-class-reminders";
export const REMINDER_MINUTES_KEY = "roster-reminder-minutes";
const DELIVERY_KEY = "roster-reminder-deliveries";
export function getReminderMinutes() {
   const value = Number(readBrowserStorage("localStorage", REMINDER_MINUTES_KEY) ?? 5);
   return Number.isInteger(value) && value >= 1 && value <= 60 ? value : 5;
}
export function isClassReminderDue(item: Class, minutes: number, now: number) {
   const start = parseLocalDateTime(item.start).getTime();
   return item.status !== "cancelled" && start > now && start - minutes * 60_000 <= now;
}
export function getClassReminderBody(item: Pick<Class, "title" | "room" | "start">, now: number) {
   const minutes = Math.max(1, Math.ceil((parseLocalDateTime(item.start).getTime() - now) / 60_000));
   const room = item.room.trim();
   return `${item.title} is starting in ${minutes} minute${minutes === 1 ? "" : "s"}${room ? ` in room ${room}` : ""}`;
}
let warningShown = false;
export async function notifyUpcomingClasses(classes: Class[], contextId: string, isActive: () => boolean) {
   const epoch = readBrowserStorage("localStorage", "roster-session-epoch-v1");
   const current = () =>
      isActive() &&
      epoch === readBrowserStorage("localStorage", "roster-session-epoch-v1") &&
      readBrowserStorage("localStorage", CLASS_REMINDERS_KEY) === "true" &&
      getClassNotificationPermission() === "granted";
   if (!current()) return;
   const send = async () => {
      let ledger: Record<string, number> = {};
      try {
         const parsed: unknown = JSON.parse(readBrowserStorage("localStorage", DELIVERY_KEY) ?? "{}");
         if (parsed && typeof parsed === "object" && !Array.isArray(parsed))
            ledger = Object.fromEntries(
               Object.entries(parsed).filter((entry): entry is [string, number] => typeof entry[1] === "number" && entry[1] > Date.now())
            );
      } catch {
         /* Ignore corrupt delivery history. */
      }
      for (const item of classes) {
         const key = JSON.stringify([contextId, item.id, item.start]);
         const due = () => current() && isClassReminderDue(item, getReminderMinutes(), Date.now());
         if (ledger[key] || !due()) continue;
         const start = parseLocalDateTime(item.start);
         const body = getClassReminderBody(item, Date.now());
         if (!(await deliverClassNotification(body, `class-reminder:${key}`, due))) continue;
         ledger[key] = start.getTime();
         writeBrowserStorage("localStorage", DELIVERY_KEY, JSON.stringify(ledger));
      }
   };
   try {
      if ("locks" in navigator) await navigator.locks.request("roster-class-reminders", send);
      else await send();
   } catch {
      if (!warningShown) {
         warningShown = true;
         notifyWarning("This browser could not deliver a class reminder.");
      }
   }
}
