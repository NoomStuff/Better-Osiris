import type { RosterResponse } from "../../shared/roster";
import { parseLesson, parseRosterResponse } from "../../shared/rosterValidation";
import { getIsoWeekNumber, getLocalWeekStartIso, shiftIsoDateByDays } from "./date";
import { notifyError } from "./notyf";
import { readBrowserStorage, removeBrowserStorage, writeBrowserStorage } from "./browserStorage";
import { CURRENT_WEEK_CACHE_KEY, LAST_WEEK_CACHE_KEY, SESSION_LESSON_DIFFS_KEY } from "./rosterCache";
import type { SessionLessonDiff, SessionLessonDiffsByWeek } from "./rosterSessionDiffs";

interface CachedRosterWeek {
   data: RosterResponse;
   weekNumber: number;
   weekStart?: string;
}

function getRosterReferenceDate() {
   return new Date();
}

function getCurrentWeekNumber() {
   return getIsoWeekNumber(getCurrentWeekStartIso());
}

function getCurrentWeekStartIso() {
   return getLocalWeekStartIso(getRosterReferenceDate());
}

function getLastWeekStartIso() {
   return shiftIsoDateByDays(getCurrentWeekStartIso(), -7);
}

function normalizeCachedWeek(data: RosterResponse, offset: number): RosterResponse {
   return {
      ...data,
      week: { ...data.week, offset },
   };
}

function parseCachedRosterWeek(cacheKey: string) {
   const cached = readBrowserStorage("localStorage", cacheKey);
   if (!cached) {
      return null;
   }

   const parsed = JSON.parse(cached) as unknown;
   const record = readRecord(parsed, "cached roster");
   const hasWrapper = "data" in record;
   const data = parseRosterResponse(hasWrapper ? record["data"] : record);
   const weekNumber = hasWrapper ? readNumber(record["weekNumber"], "cached roster week number") : data.week.number;
   const weekStart = hasWrapper ? readString(record["weekStart"], "cached roster week start") : data.week.start;
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
         removeBrowserStorage("localStorage", CURRENT_WEEK_CACHE_KEY);
         return null;
      }

      return normalizeCachedWeek(cached.data, 0);
   } catch (error) {
      removeBrowserStorage("localStorage", CURRENT_WEEK_CACHE_KEY);
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
         return normalizeCachedWeek(cachedLastWeek.data, -1);
      }

      if (cachedLastWeek) {
         removeBrowserStorage("localStorage", LAST_WEEK_CACHE_KEY);
      }

      const cachedCurrentWeek = parseCachedRosterWeek(CURRENT_WEEK_CACHE_KEY);
      if (cachedCurrentWeek?.weekStart !== lastWeekStart) {
         return null;
      }

      const lastWeek = normalizeCachedWeek(cachedCurrentWeek.data, -1);
      storeCachedLastWeek(lastWeek);
      removeBrowserStorage("localStorage", CURRENT_WEEK_CACHE_KEY);
      return lastWeek;
   } catch (error) {
      removeBrowserStorage("localStorage", LAST_WEEK_CACHE_KEY);
      removeBrowserStorage("localStorage", CURRENT_WEEK_CACHE_KEY);
      notifyError(error, "Failed to parse cached last week.");
      return null;
   }
}

function storeCachedLastWeek(data: RosterResponse) {
   if (typeof window === "undefined") {
      return;
   }

   writeBrowserStorage(
      "localStorage",
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

   writeBrowserStorage(
      "localStorage",
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
      const stored = readBrowserStorage("sessionStorage", SESSION_LESSON_DIFFS_KEY);
      if (!stored) {
         return new Map();
      }

      const parsed = readRecord(JSON.parse(stored) as unknown, "session roster changes");
      return new Map(
         Object.entries(parsed).map(([weekOffset, value]) => {
            if (!Array.isArray(value) || !Number.isSafeInteger(Number(weekOffset))) {
               throw new Error("Stored session roster changes have an invalid shape.");
            }
            const diffs = value.map((diff, index) => parseSessionLessonDiff(diff, `session roster changes ${weekOffset}[${index}]`));
            return [Number(weekOffset), new Map(diffs.map((diff) => [diff.lesson.id, diff]))];
         })
      );
   } catch (error) {
      removeBrowserStorage("sessionStorage", SESSION_LESSON_DIFFS_KEY);
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

   writeBrowserStorage("sessionStorage", SESSION_LESSON_DIFFS_KEY, JSON.stringify(serialized));
}

function parseSessionLessonDiff(value: unknown, path: string): SessionLessonDiff {
   const record = readRecord(value, path);
   const status = record["status"];
   if (status !== "changed" && status !== "cancelled") {
      throw new Error(`${path} has an invalid status.`);
   }
   return {
      lesson: parseLesson(record["lesson"], `${path}.lesson`),
      previousLesson: parseLesson(record["previousLesson"], `${path}.previousLesson`),
      status,
   };
}

function readRecord(value: unknown, label: string): Record<string, unknown> {
   if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error(`${label} must be an object.`);
   }
   return value as Record<string, unknown>;
}

function readNumber(value: unknown, label: string) {
   if (typeof value !== "number" || !Number.isSafeInteger(value)) {
      throw new Error(`${label} must be an integer.`);
   }
   return value;
}

function readString(value: unknown, label: string) {
   if (typeof value !== "string") {
      throw new Error(`${label} must be a string.`);
   }
   return value;
}
