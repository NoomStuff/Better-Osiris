import { parseClass, parseWeek } from "../../shared/rosterValidation";
import { isValidTimeZone } from "../../shared/timeZone";
import { shiftCalendarDate } from "../../shared/calendar";
import type { Week } from "../types/weeks";
import { readBrowserStorage, removeBrowserStorage, writeBrowserStorage } from "./browserStorage";
import { WEEK_CACHE_KEY, SESSION_CLASS_DIFFS_KEY, clearLegacyWeekCache } from "./weekCache";
import type { SessionClassDiffsByWeek } from "./classDiffs";

export interface StoredWeek {
   data: Week;
   fetchedAt: number;
   checkedAt: number;
   changedAt: number;
   /** Includes removed/moved IDs, so deleting a class cannot erase its freshness history. */
   classFetchTimes?: Record<string, number>;
}
export interface WeekCache {
   contextId: string;
   timeZone: string;
   weeks: StoredWeek[];
}

/** A delayed server-cache response must not undo fresher data, including a class moved between weeks. */
export function getFreshIncomingWeeks(incoming: readonly Week[], fetchedAt: number, stored: ReadonlyMap<string, StoredWeek>): Week[] {
   const classFetchTimes = new Map<string, number>();
   stored.forEach((week) => {
      week.data.classes.forEach((schoolClass) => {
         classFetchTimes.set(schoolClass.id, Math.max(classFetchTimes.get(schoolClass.id) ?? 0, week.fetchedAt));
      });
      Object.entries(week.classFetchTimes ?? {}).forEach(([id, fetchedAt]) => classFetchTimes.set(id, Math.max(classFetchTimes.get(id) ?? 0, fetchedAt)));
   });
   return incoming.filter(
      (week) =>
         fetchedAt >= (stored.get(week.week.start)?.fetchedAt ?? 0) &&
         week.classes.every((schoolClass) => fetchedAt >= (classFetchTimes.get(schoolClass.id) ?? 0))
   );
}

export function getClassFetchTimes(old: StoredWeek | undefined, next: Week, fetchedAt: number, directlyFetched: boolean): Record<string, number> {
   const times = new Map(Object.entries(old?.classFetchTimes ?? {}));
   const nextIds = new Set(next.classes.map((item) => item.id));
   old?.data.classes.forEach((item) => {
      const observedAt = directlyFetched || !nextIds.has(item.id) ? fetchedAt : old.fetchedAt;
      times.set(item.id, Math.max(times.get(item.id) ?? 0, observedAt));
   });
   if (directlyFetched) next.classes.forEach((item) => times.set(item.id, Math.max(times.get(item.id) ?? 0, fetchedAt)));
   return Object.fromEntries(times);
}

export function readWeekCache(): WeekCache | null {
   clearLegacyWeekCache();
   const text = readBrowserStorage("localStorage", WEEK_CACHE_KEY);
   if (!text) return null;
   try {
      const record = readRecord(JSON.parse(text) as unknown);
      const contextId = readString(record["contextId"]);
      const timeZone = readString(record["timeZone"]);
      if (!isValidTimeZone(timeZone) || !Array.isArray(record["weeks"])) throw new Error("Invalid cache.");
      const weeks = record["weeks"].map((value: unknown) => {
         const row = readRecord(value);
         return {
            data: parseWeek(row["data"]),
            fetchedAt: timestamp(row["fetchedAt"]),
            checkedAt: timestamp(row["checkedAt"]),
            changedAt: timestamp(row["changedAt"]),
            ...(row["classFetchTimes"] === undefined
               ? {}
               : { classFetchTimes: Object.fromEntries(Object.entries(readRecord(row["classFetchTimes"])).map(([id, time]) => [id, timestamp(time)])) }),
         };
      });
      if (weeks.length > 32 || new Set(weeks.map((week) => week.data.week.start)).size !== weeks.length) throw new Error("Invalid cached weeks.");
      return { contextId, timeZone, weeks };
   } catch {
      removeBrowserStorage("localStorage", WEEK_CACHE_KEY);
      return null;
   }
}

export function storeWeekCache(cache: WeekCache, currentWeek: string) {
   const weeks = [...cache.weeks]
      .sort((a, b) => {
         const priority = (week: StoredWeek) => (week.data.week.start <= currentWeek ? 1 : 0);
         return priority(b) - priority(a) || b.checkedAt - a.checkedAt;
      })
      .slice(0, 32);
   writeBrowserStorage("localStorage", WEEK_CACHE_KEY, JSON.stringify({ ...cache, weeks }));
}

export function readSessionClassDiffs(contextId: string, timeZone: string): SessionClassDiffsByWeek {
   const text = readBrowserStorage("sessionStorage", SESSION_CLASS_DIFFS_KEY);
   if (!text) return new Map();
   try {
      const record = readRecord(JSON.parse(text) as unknown);
      if (record["contextId"] !== contextId || record["timeZone"] !== timeZone) return new Map();
      const weeks = readRecord(record["weeks"]);
      return new Map(
         Object.entries(weeks).map(([date, values]) => {
            if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Array.isArray(values)) throw new Error("Invalid changes.");
            return [
               date,
               new Map(
                  values.map((value: unknown) => {
                     const item = parseClass(value);
                     if (item.status === "scheduled" || item.start.slice(0, 10) < date || item.start.slice(0, 10) > shiftCalendarDate(date, 6))
                        throw new Error("Invalid change date.");
                     return [item.id, { schoolClass: item, status: item.status, ...(item.previous ? { previousClass: item.previous } : {}) }];
                  })
               ),
            ];
         })
      );
   } catch {
      removeBrowserStorage("sessionStorage", SESSION_CLASS_DIFFS_KEY);
      return new Map();
   }
}

export function storeSessionClassDiffs(changes: SessionClassDiffsByWeek, contextId: string, timeZone: string) {
   const weeks = Object.fromEntries([...changes].map(([date, diffs]) => [date, [...diffs.values()].map((diff) => diff.schoolClass)]));
   writeBrowserStorage("sessionStorage", SESSION_CLASS_DIFFS_KEY, JSON.stringify({ contextId, timeZone, weeks }));
}

function readRecord(value: unknown): Record<string, unknown> {
   if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Expected record.");
   return value as Record<string, unknown>;
}
function readString(value: unknown): string {
   if (typeof value !== "string" || !value) throw new Error("Expected string.");
   return value;
}
function timestamp(value: unknown): number {
   if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) throw new Error("Expected timestamp.");
   return value;
}
