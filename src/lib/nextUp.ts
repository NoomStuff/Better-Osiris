import { shiftCalendarDate } from "../../shared/calendar";
import { clamp } from "./clamp";
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
   /** The primary lead: "in 12 min", "Tomorrow", "45 min left". The room and exact times come from the target. */
   lead: string;
   /** Elapsed fraction of the running target, 0 for upcoming classes. */
   progress: number;
}

/** How long before a running class ends the card switches to the next one; time to start moving. */
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
      const remaining = running.endDate.getTime() - nowTime;
      // Close to the bell the next class takes over, as long as it is close enough to be worth naming.
      if (upcomingVisible && remaining <= ADVANCE_SWITCH_MS) {
         return getUpcomingSuggestion(upcoming, now);
      }

      const duration = running.endDate.getTime() - running.startDate.getTime();
      return {
         phase: "now",
         target: running,
         lead: `${getDurationLabel(remaining)} left`,
         progress: duration > 0 ? clamp((nowTime - running.startDate.getTime()) / duration, 0, 1) : 1,
      };
   }

   return upcomingVisible ? getUpcomingSuggestion(upcoming, now) : null;
}

function getUpcomingSuggestion(target: NextUpEntry, now: Date): NextUpSuggestion {
   return {
      phase: "upcoming",
      target,
      lead: getLeadLabel(target.startDate.getTime() - now.getTime(), now),
      progress: 0,
   };
}

/** "45 minutes" / "1 hour 5 minutes"; always at least a minute so an imminent moment never reads as zero. */
function getDurationLabel(durationMs: number): string {
   const totalMinutes = Math.max(1, Math.ceil(durationMs / 60_000));
   if (totalMinutes < 60) return `${totalMinutes} minute${totalMinutes === 1 ? "" : "s"}`;
   const hours = Math.floor(totalMinutes / 60);
   const minutes = totalMinutes % 60;
   return `${hours} hour${hours === 1 ? "" : "s"}${minutes > 0 ? ` ${minutes} minute${minutes === 1 ? "" : "s"}` : ""}`;
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
      return `In ${hours} hour${hours === 1 ? "" : "s"}${minutes > 0 ? ` ${minutes} minute${minutes === 1 ? "" : "s"}` : ""}`;
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
