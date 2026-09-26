import { shiftCalendarDate } from "../../shared/calendar";
import { clamp } from "./clamp";
import { dayShortLabel, parseLocalDateTime, timeLabel, toDayKey } from "./date";
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
   /** Elapsed fraction of the target, 0 for upcoming classes. */
   progress: number;
   /** The cancelled class that died between now and the target, explaining why the target is not the first one. */
   cancelled: NextUpEntry | null;
   /** The next active class after the target; only shown while the target is running. */
   then: NextUpEntry | null;
}

/** Beyond this horizon the absolute day and time say more than a countdown. */
const UPCOMING_COUNTDOWN_LIMIT_MS = 90 * 60_000;

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
   const target = active.find((entry) => entry.startDate.getTime() <= nowTime && nowTime < entry.endDate.getTime());

   if (target) {
      const duration = target.endDate.getTime() - target.startDate.getTime();
      return {
         phase: "now",
         target,
         progress: duration > 0 ? clamp((nowTime - target.startDate.getTime()) / duration, 0, 1) : 1,
         cancelled: getCancelledBefore(entries, target, nowTime),
         then: active.find((entry) => entry.startDate.getTime() > nowTime) ?? null,
      };
   }

   const upcoming = active.find((entry) => entry.startDate.getTime() > nowTime);
   if (!upcoming) return null;
   return { phase: "upcoming", target: upcoming, progress: 0, cancelled: getCancelledBefore(entries, upcoming, nowTime), then: null };
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

/** "12 min", "1 hr 5 min"; always at least a minute so an imminent start never reads as zero. */
export function getNextUpDurationLabel(durationMs: number): string {
   const totalMinutes = Math.max(1, Math.ceil(durationMs / 60_000));
   if (totalMinutes < 60) return `${totalMinutes} min`;
   const hours = Math.floor(totalMinutes / 60);
   const minutes = totalMinutes % 60;
   return `${hours} hr${hours === 1 ? "" : "s"}${minutes > 0 ? ` ${minutes} min` : ""}`;
}

/**
 * The one-line answer shared by the collapsed handle and the card header: how soon, or
 * when on the calendar once the countdown stops earning its place.
 */
export function getNextUpSummary(suggestion: NextUpSuggestion, now: Date): string {
   if (suggestion.phase === "now") {
      return `Now · ${getNextUpDurationLabel(suggestion.target.endDate.getTime() - now.getTime())} left`;
   }

   const delta = suggestion.target.startDate.getTime() - now.getTime();
   if (delta < UPCOMING_COUNTDOWN_LIMIT_MS) {
      return `in ${getNextUpDurationLabel(delta)}`;
   }

   return `${getNextUpDayLabel(suggestion.target, now) ?? "Today"} ${timeLabel.format(suggestion.target.startDate)}`;
}

/** "Tomorrow" or the weekday of an entry; null when it falls on today. */
export function getNextUpDayLabel(entry: NextUpEntry, now: Date): string | null {
   const todayKey = toDayKey(now);
   const dayKey = toDayKey(entry.startDate);
   if (dayKey === todayKey) return null;
   if (dayKey === shiftCalendarDate(todayKey, 1)) return "Tomorrow";
   return dayShortLabel.format(entry.startDate);
}
