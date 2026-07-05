import type { RosterResponse } from "../../shared/roster";
import { getIsoWeekNumber, getLocalWeekStartIso } from "./date";
import { notifyError } from "./notyf";
import { CURRENT_WEEK_CACHE_KEY, LAST_WEEK_CACHE_KEY, SESSION_LESSON_DIFFS_KEY } from "./rosterCache";
import type { SessionLessonDiff, SessionLessonDiffsByWeek } from "./rosterSessionDiffs";

interface CachedRosterWeek {
   data: RosterResponse;
   weekNumber: number;
   weekStart?: string;
}

function getRosterReferenceDate() {
   const date = new Date();
   const day = date.getDay();

   if (day === 6) {
      date.setDate(date.getDate() + 2);
   } else if (day === 0) {
      date.setDate(date.getDate() + 1);
   }

   return date;
}

function getCurrentWeekNumber() {
   return getIsoWeekNumber(getRosterReferenceDate().toISOString());
}

function getCurrentWeekStartIso() {
   return getLocalWeekStartIso(getRosterReferenceDate());
}

function getLastWeekStartIso() {
   const date = getRosterReferenceDate();
   date.setDate(date.getDate() - 7);
   return getLocalWeekStartIso(date);
}

function normalizeCachedWeek(data: RosterResponse, offset: number, note?: string): RosterResponse {
   return {
      ...data,
      week: { ...data.week, offset },
      source: note ? { ...data.source, note } : data.source,
   };
}

function parseCachedRosterWeek(cacheKey: string) {
   const cached = window.localStorage.getItem(cacheKey);
   if (!cached) {
      return null;
   }

   const parsed = JSON.parse(cached) as CachedRosterWeek | RosterResponse;
   const data = "data" in parsed ? parsed.data : parsed;
   const weekNumber = "weekNumber" in parsed ? parsed.weekNumber : data.week.number;
   const weekStart = "weekStart" in parsed ? parsed.weekStart : data.week.start;
   return { data, weekNumber, weekStart };
}

export function readCachedCurrentWeek() {
   if (typeof window === "undefined") {
      return null;
   }

   try {
      const cached = parseCachedRosterWeek(CURRENT_WEEK_CACHE_KEY);
      if (!cached) {
         return null;
      }

      if (cached.weekNumber !== getCurrentWeekNumber() || cached.weekStart !== getCurrentWeekStartIso()) {
         window.localStorage.removeItem(CURRENT_WEEK_CACHE_KEY);
         return null;
      }

      return normalizeCachedWeek(cached.data, 0);
   } catch (error) {
      notifyError(error, "Failed to parse cached current week.");
      return null;
   }
}

export function readCachedLastWeek() {
   if (typeof window === "undefined") {
      return null;
   }

   const lastWeekStart = getLastWeekStartIso();

   try {
      const cachedLastWeek = parseCachedRosterWeek(LAST_WEEK_CACHE_KEY);
      if (cachedLastWeek?.weekStart === lastWeekStart) {
         return normalizeCachedWeek(cachedLastWeek.data, -1, "Using locally cached OSIRIS roster data from last week.");
      }

      if (cachedLastWeek) {
         window.localStorage.removeItem(LAST_WEEK_CACHE_KEY);
      }

      const cachedCurrentWeek = parseCachedRosterWeek(CURRENT_WEEK_CACHE_KEY);
      if (cachedCurrentWeek?.weekStart !== lastWeekStart) {
         return null;
      }

      const lastWeek = normalizeCachedWeek(cachedCurrentWeek.data, -1, "Using locally cached OSIRIS roster data from last week.");
      storeCachedLastWeek(lastWeek);
      window.localStorage.removeItem(CURRENT_WEEK_CACHE_KEY);
      return lastWeek;
   } catch (error) {
      notifyError(error, "Failed to parse cached last week.");
      return null;
   }
}

function storeCachedLastWeek(data: RosterResponse) {
   if (typeof window === "undefined") {
      return;
   }

   window.localStorage.setItem(
      LAST_WEEK_CACHE_KEY,
      JSON.stringify({
         data: normalizeCachedWeek(data, -1),
         weekNumber: data.week.number,
         weekStart: data.week.start,
      } satisfies CachedRosterWeek)
   );
}

export function storeCachedCurrentWeek(data: RosterResponse) {
   if (typeof window === "undefined" || data.week.offset !== 0) {
      return;
   }

   try {
      const cachedCurrentWeek = parseCachedRosterWeek(CURRENT_WEEK_CACHE_KEY);
      if (cachedCurrentWeek?.weekStart === getLastWeekStartIso()) {
         storeCachedLastWeek(cachedCurrentWeek.data);
      }
   } catch (error) {
      notifyError(error, "Failed to update cached last week.");
   }

   window.localStorage.setItem(
      CURRENT_WEEK_CACHE_KEY,
      JSON.stringify({
         data,
         weekNumber: data.week.number,
         weekStart: data.week.start,
      } satisfies CachedRosterWeek)
   );
}

export function readSessionLessonDiffs(): SessionLessonDiffsByWeek {
   if (typeof window === "undefined") {
      return new Map();
   }

   try {
      const stored = window.sessionStorage.getItem(SESSION_LESSON_DIFFS_KEY);
      if (!stored) {
         return new Map();
      }

      const parsed = JSON.parse(stored) as Record<string, SessionLessonDiff[]>;
      return new Map(Object.entries(parsed).map(([weekOffset, diffs]) => [Number(weekOffset), new Map(diffs.map((diff) => [diff.lesson.id, diff]))]));
   } catch (error) {
      notifyError(error, "Failed to parse session roster changes.");
      return new Map();
   }
}

export function storeSessionLessonDiffs(weekDiffs: SessionLessonDiffsByWeek) {
   if (typeof window === "undefined") {
      return;
   }

   const serialized = Object.fromEntries(
      [...weekDiffs.entries()].filter(([, diffs]) => diffs.size > 0).map(([weekOffset, diffs]) => [String(weekOffset), [...diffs.values()]])
   );

   window.sessionStorage.setItem(SESSION_LESSON_DIFFS_KEY, JSON.stringify(serialized));
}
