import { useEffect } from "react";
import { getNextReminderCheckDelay, getReminderMinutes, notifyUpcomingClasses } from "../lib/classReminders";
import type { WeekEntries } from "../lib/weekPolicy";

export function useClassReminders(entries: WeekEntries, contextId: string | null, enabled: boolean) {
   useEffect(() => {
      if (!enabled || !contextId) return;
      let active = true;
      const classes = Object.values(entries).flatMap((entry) => entry?.data?.classes ?? []);
      let timer: ReturnType<typeof setTimeout>;
      const check = () => {
         clearTimeout(timer);
         void notifyUpcomingClasses(classes, contextId, () => active);
         const delay = getNextReminderCheckDelay(classes, getReminderMinutes() * 60_000, Date.now());
         if (delay === null) return;
         // Sleep until the next due moment. One second keeps timing stable, one day
         // bounds the wait so clock changes and far-future classes cannot stall the chain.
         timer = setTimeout(check, Math.min(Math.max(delay, 1_000), 24 * 60 * 60_000));
      };
      check();
      window.addEventListener("storage", check);
      window.addEventListener("notificationpreferenceschange", check);
      window.addEventListener("pageshow", check);
      document.addEventListener("visibilitychange", check);
      return () => {
         active = false;
         clearTimeout(timer);
         window.removeEventListener("storage", check);
         window.removeEventListener("notificationpreferenceschange", check);
         window.removeEventListener("pageshow", check);
         document.removeEventListener("visibilitychange", check);
      };
   }, [entries, enabled, contextId]);
}
