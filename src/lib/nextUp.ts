import { shiftCalendarDate } from "../../shared/calendar";
import { parseLocalDateTime, toDayKey } from "./date";
import type { Class, Week } from "../types/weeks";

/** A class with its times resolved to instants, ready to compare against "now". */
export interface NextUpEntry {
   schoolClass: Class;
   startDate: Date;
   endDate: Date;
}

export interface NextUpSuggestion {
   /** "now" while the target class is running, "upcoming" before it starts. */
   phase: "now" | "upcoming";
   target: NextUpEntry;
   /** The primary lead shown in the pill. */
   lead: string;
}

/** How soon the next class must start before it replaces the running class in the card. */
const ADVANCE_SWITCH_MS = 10 * 60_000;
/** The card only cares about the next day: classes further out than this never surface. */
const VISIBILITY_LIMIT_MS = 24 * 3_600_000;
/** Hours above this round to whole hours instead of carrying minutes. */
const MINUTES_IN_LEAD_LIMIT_MS = 3 * 3_600_000;
/** Durations tick up to this horizon; past it the calendar word "Tomorrow" reads better. */
const HOURS_IN_LEAD_LIMIT_MS = 12 * 3_600_000;

/**
 * Resolves class times once per roster change; picking a suggestion then only compares dates,
 * so minute ticks stay cheap. Cancelled classes are ignored entirely: the card always points
 * at the next class the user can actually attend.
 */
export function collectNextUpEntries(weeks: Week[]): NextUpEntry[] {
   const entries: NextUpEntry[] = [];
   for (const week of weeks) {
      for (const schoolClass of week.classes) {
         const startDate = parseLocalDateTime(schoolClass.start);
         const endDate = parseLocalDateTime(schoolClass.end);
         if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || endDate <= startDate) continue;
         entries.push({ schoolClass, startDate, endDate });
      }
   }
   entries.sort((a, b) => a.startDate.getTime() - b.startDate.getTime() || a.endDate.getTime() - b.endDate.getTime());
   return entries;
}

export function getNextUpSuggestion(entries: NextUpEntry[], now: Date): NextUpSuggestion | null {
   const active = entries.filter((entry) => entry.schoolClass.status !== "cancelled");
   const nowTime = now.getTime();
   const running = active.find((entry) => entry.startDate.getTime() <= nowTime && nowTime < entry.endDate.getTime());
   const upcoming = active.find((entry) => entry.startDate.getTime() > nowTime);
   const upcomingVisible = upcoming !== undefined && upcoming.startDate.getTime() - nowTime <= VISIBILITY_LIMIT_MS;

   if (running) {
      // A class starting soon is more useful than the current one. The current class remains
      // visible through its final minutes when the next class is still separated by a break.
      if (upcomingVisible && upcoming.startDate.getTime() - nowTime <= ADVANCE_SWITCH_MS) {
         return getUpcomingSuggestion(upcoming, now);
      }

      return {
         phase: "now",
         target: running,
         lead: "Now",
      };
   }

   return upcomingVisible ? getUpcomingSuggestion(upcoming, now) : null;
}

function getUpcomingSuggestion(target: NextUpEntry, now: Date): NextUpSuggestion {
   return {
      phase: "upcoming",
      target,
      lead: getLeadLabel(target.startDate.getTime() - now.getTime(), now),
   };
}

/**
 * Time until a class starts, in speaking order: minutes, hours, then "Tomorrow".
 * Only ever called within the visibility window, so no further horizons are needed.
 */
export function getLeadLabel(deltaMs: number, now: Date): string {
   const totalMinutes = Math.max(1, Math.ceil(deltaMs / 60_000));
   if (totalMinutes < 60) return `In ${totalMinutes} minute${totalMinutes === 1 ? "" : "s"}`;

   if (deltaMs < MINUTES_IN_LEAD_LIMIT_MS) {
      const hours = Math.floor(totalMinutes / 60);
      const minutes = totalMinutes % 60;
      return `In ${hours} hour${hours === 1 ? "" : "s"}${minutes > 0 ? `, ${minutes} minute${minutes === 1 ? "" : "s"}` : ""}`;
   }

   const roundedHours = Math.min(23, Math.round(deltaMs / 3_600_000));
   if (deltaMs < HOURS_IN_LEAD_LIMIT_MS || getCalendarDayGap(deltaMs, now) === 0) {
      return `In ${roundedHours} hours`;
   }
   return "Tomorrow";
}

/** Whole calendar days between the moment that is `deltaMs` away and today, ignoring the clock time. */
function getCalendarDayGap(deltaMs: number, now: Date): number {
   const then = toDayKey(new Date(now.getTime() + deltaMs));
   const today = toDayKey(now);
   return Math.round((Date.parse(`${then}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / (24 * 3_600_000));
}

/** "Tomorrow" for a class on the next calendar day; null when it falls on today. */
export function getNextUpDayLabel(entry: NextUpEntry, now: Date): string | null {
   const todayKey = toDayKey(now);
   if (toDayKey(entry.startDate) === shiftCalendarDate(todayKey, 1)) return "Tomorrow";
   return null;
}
