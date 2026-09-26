import { shiftCalendarDate } from "../../shared/calendar";
import { clamp } from "./clamp";
import { dayShortLabel, parseLocalDateTime, toDayKey } from "./date";
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
   /** The cancelled class that died between now and the target, explaining why the target is not the first one. */
   cancelled: NextUpEntry | null;
   /** The next active class after the running target. */
   then: NextUpEntry | null;
}

/** How long before a running class ends the card switches to the next one; time to start moving. */
const ADVANCE_SWITCH_MS = 10 * 60_000;
/** Hours above this round to whole hours instead of carrying minutes. */
const MINUTES_IN_LEAD_LIMIT_MS = 3 * 3_600_000;
/** Beyond this horizon the calendar takes over from the clock: hours stop ticking, days start counting. */
const LEAD_CALENDAR_LIMIT_MS = 12 * 3_600_000;

/**
 * Resolves class times once per roster change; picking a suggestion then only compares dates,
 * so minute ticks stay cheap. Cancelled classes never become the target, but a recent
 * cancellation is surfaced so the card explains itself.
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

   if (running) {
      const remaining = running.endDate.getTime() - nowTime;
      // Close to the bell the next class takes over: the question becomes where to go next.
      if (upcoming && remaining <= ADVANCE_SWITCH_MS) {
         return getUpcomingSuggestion(entries, upcoming, now);
      }

      const duration = running.endDate.getTime() - running.startDate.getTime();
      return {
         phase: "now",
         target: running,
         lead: `${getDurationLabel(remaining)} left`,
         progress: duration > 0 ? clamp((nowTime - running.startDate.getTime()) / duration, 0, 1) : 1,
         cancelled: getCancelledBefore(entries, running, nowTime),
         then: upcoming ?? null,
      };
   }

   return upcoming ? getUpcomingSuggestion(entries, upcoming, now) : null;
}

function getUpcomingSuggestion(entries: NextUpEntry[], target: NextUpEntry, now: Date): NextUpSuggestion {
   return {
      phase: "upcoming",
      target,
      lead: getLeadLabel(target.startDate.getTime() - now.getTime(), now),
      progress: 0,
      cancelled: getCancelledBefore(entries, target, now.getTime()),
      then: null,
   };
}

/** The most recent cancellation that is still ahead of "now" and sits before the target. */
function getCancelledBefore(entries: NextUpEntry[], target: NextUpEntry, nowTime: number): NextUpEntry | null {
   let latest: NextUpEntry | null = null;
   for (const entry of entries) {
      if (entry.schoolClass.status !== "cancelled") continue;
      if (entry.startDate.getTime() >= target.startDate.getTime()) continue;
      if (entry.endDate.getTime() <= nowTime) continue;
      if (!latest || entry.startDate.getTime() > latest.startDate.getTime()) latest = entry;
   }
   return latest;
}

/** "45 min" / "1 hr 5 min"; always at least a minute so an imminent moment never reads as zero. */
function getDurationLabel(durationMs: number): string {
   const totalMinutes = Math.max(1, Math.ceil(durationMs / 60_000));
   if (totalMinutes < 60) return `${totalMinutes} min`;
   const hours = Math.floor(totalMinutes / 60);
   const minutes = totalMinutes % 60;
   return `${hours} hr${hours === 1 ? "" : "s"}${minutes > 0 ? ` ${minutes} min` : ""}`;
}

/**
 * Time until a class starts, in speaking order: minutes, hours, tomorrow, days, weeks.
 * Durations tick below twelve hours; beyond that the calendar labels take over.
 */
export function getLeadLabel(deltaMs: number, now: Date): string {
   const totalMinutes = Math.max(1, Math.ceil(deltaMs / 60_000));
   if (totalMinutes < 60) return `in ${totalMinutes} min`;

   if (deltaMs < MINUTES_IN_LEAD_LIMIT_MS) {
      const hours = Math.floor(totalMinutes / 60);
      const minutes = totalMinutes % 60;
      return `in ${hours} hr${hours === 1 ? "" : "s"}${minutes > 0 ? ` ${minutes} min` : ""}`;
   }

   const roundedHours = Math.round(deltaMs / 3_600_000);
   if (deltaMs < LEAD_CALENDAR_LIMIT_MS) return `in ${roundedHours} hr`;

   const days = getCalendarDayGap(deltaMs, now);
   if (days === 0) return `in ${roundedHours} hr`;
   if (days === 1) return "Tomorrow";
   if (days < 7) return `in ${days} days`;
   const weeks = Math.max(1, Math.round(days / 7));
   return `in ${weeks} week${weeks === 1 ? "" : "s"}`;
}

/** Whole calendar days between the moment that is `deltaMs` away and today, ignoring the clock time. */
function getCalendarDayGap(deltaMs: number, now: Date): number {
   const then = toDayKey(new Date(now.getTime() + deltaMs));
   const today = toDayKey(now);
   return Math.round((Date.parse(`${then}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / (24 * 3_600_000));
}

/** "Tomorrow" or the weekday of an entry; null when it falls on today. */
export function getNextUpDayLabel(entry: NextUpEntry, now: Date): string | null {
   const todayKey = toDayKey(now);
   const dayKey = toDayKey(entry.startDate);
   if (dayKey === todayKey) return null;
   if (dayKey === shiftCalendarDate(todayKey, 1)) return "Tomorrow";
   return dayShortLabel.format(entry.startDate);
}
