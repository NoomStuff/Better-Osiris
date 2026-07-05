import type { RosterResponse } from "../../shared/roster";
import type { RosterLoadError } from "./rosterLoadError";
import { createWeekEntry, isSameRosterData, type WeekEntries } from "./rosterWeekPolicy";

export type RosterWeekAction =
   | { type: "reset" }
   | { type: "fetch-started"; offsets: number[]; force: boolean; passive: boolean }
   | { type: "fetch-succeeded"; weeks: RosterResponse[] }
   | { type: "passive-fetch-failed"; offsets: number[]; error: RosterLoadError }
   | { type: "fetch-failed"; offsets: number[]; error: RosterLoadError; force: boolean; retryAt: number; retryDelayMs: number };

export function rosterWeekReducer(entries: WeekEntries, action: RosterWeekAction): WeekEntries {
   if (action.type === "reset") {
      return {};
   }

   const next = { ...entries };

   if (action.type === "fetch-started") {
      action.offsets.forEach((offset) => {
         const current = entries[offset];
         if (action.passive && !current?.data) {
            return;
         }

         if (action.force || !current?.data) {
            next[offset] = createWeekEntry(current?.data ?? null, {
               error: current?.data ? null : (current?.error ?? null),
               isFetching: true,
               isHydrated: action.force ? false : (current?.isHydrated ?? false),
               retryAt: 0,
               retryDelayMs: current?.retryDelayMs ?? 0,
               updatedAt: current?.updatedAt ?? 0,
            });
         }
      });
      return next;
   }

   if (action.type === "fetch-succeeded") {
      action.weeks.forEach((week) => {
         const current = entries[week.week.offset];
         next[week.week.offset] = isSameRosterData(current?.data, week)
            ? createWeekEntry(current?.data ?? week, {
                 error: null,
                 retryAt: 0,
                 retryDelayMs: 0,
                 isFetching: false,
                 isHydrated: false,
                 updatedAt: current?.updatedAt ?? Date.now(),
              })
            : createWeekEntry(week);
      });
      return next;
   }

   if (action.type === "passive-fetch-failed") {
      action.offsets.forEach((offset) => {
         const current = entries[offset];
         if (current?.data) {
            next[offset] = createWeekEntry(current.data, {
               error: action.error,
               isFetching: false,
               updatedAt: current.updatedAt,
            });
         }
      });
      return next;
   }

   action.offsets.forEach((offset) => {
      const current = entries[offset];
      const shouldUpdate = action.force || !current?.data || current.isFetching;
      if (shouldUpdate) {
         next[offset] = createWeekEntry(current?.data ?? null, {
            error: action.error,
            isFetching: false,
            isHydrated: false,
            retryAt: action.retryAt,
            retryDelayMs: action.retryDelayMs,
            updatedAt: current?.updatedAt ?? 0,
         });
      }
   });
   return next;
}
