import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
   getClassFetchTimes,
   getFreshIncomingWeeks,
   readWeekCache,
   storeWeekCache,
   readSessionClassDiffs,
   storeSessionClassDiffs,
   type StoredWeek,
} from "./weekPersistence";
import { WEEK_CACHE_KEY } from "./weekCache";
import { reconcileWeeks, applySessionClassDiffs, type SessionClassDiffsByWeek } from "./classDiffs";
import { isoWeekNumber, shiftCalendarDate } from "../../shared/calendar";
import type { Week } from "../types/weeks";

class MemoryStorage {
   private items = new Map<string, string>();
   getItem(key: string) {
      return this.items.get(key) ?? null;
   }
   setItem(key: string, value: string) {
      this.items.set(key, value);
   }
   removeItem(key: string) {
      this.items.delete(key);
   }
}
function installStorage() {
   const localStorage = new MemoryStorage();
   (globalThis as { window?: unknown }).window = { localStorage, sessionStorage: new MemoryStorage() };
   return localStorage;
}
function week(start: string): Week {
   return { week: { offset: 0, number: isoWeekNumber(start), start, end: shiftCalendarDate(start, 6) }, classes: [] };
}
void describe("overlapping response freshness", () => {
   void it("retains freshness after a moved class disappears, including after cache reload", () => {
      installStorage();
      const source = week("2026-06-15");
      source.classes = [
         {
            id: "moved",
            title: "Test",
            subject: "",
            teacher: "",
            room: "",
            location: "",
            description: "",
            start: "2026-06-16T09:00:00",
            end: "2026-06-16T10:00:00",
            status: "scheduled",
         },
      ];
      const destination = week("2026-07-27");
      const original = source.classes[0];
      assert.ok(original);
      destination.classes = [{ ...original, start: "2026-07-28T09:00:00", end: "2026-07-28T10:00:00" }];
      let raw = new Map([[source.week.start, source]]);
      let changes: SessionClassDiffsByWeek = new Map();
      const stored = new Map<string, StoredWeek>([[source.week.start, { data: source, fetchedAt: 1000, checkedAt: 1000, changedAt: 1000 }]]);
      const observations: [Week, number][] = [
         [destination, 3000],
         [{ ...destination, classes: [] }, 4000],
      ];
      for (const [incoming, fetchedAt] of observations) {
         const result = reconcileWeeks(raw, [incoming], changes);
         result.rawWeeks.forEach((data, date) => {
            const old = stored.get(date);
            const direct = date === incoming.week.start;
            assert.ok(direct || old);
            stored.set(date, {
               data,
               fetchedAt: direct ? fetchedAt : (old?.fetchedAt ?? fetchedAt),
               checkedAt: fetchedAt,
               changedAt: fetchedAt,
               classFetchTimes: getClassFetchTimes(old, data, fetchedAt, direct),
            });
         });
         raw = result.rawWeeks;
         changes = result.changes;
      }
      assert.deepEqual(getFreshIncomingWeeks([source], 2000, stored), []);
      assert.deepEqual(getFreshIncomingWeeks([source], 3500, stored), []);
      storeWeekCache({ contextId: "A", timeZone: "Europe/Amsterdam", weeks: [...stored.values()] }, source.week.start);
      const cache = readWeekCache();
      assert.ok(cache);
      const loaded = new Map(cache.weeks.map((item) => [item.data.week.start, item]));
      assert.deepEqual(getFreshIncomingWeeks([source], 3500, loaded), []);
      assert.deepEqual(getFreshIncomingWeeks([source], 5000, loaded), [source]);
      delete (globalThis as { window?: unknown }).window;
   });
   void it("keeps newer weeks while accepting untouched weeks from a delayed batch", () => {
      const current = week("2026-06-15");
      const next = week("2026-06-22");
      const stored = new Map([[current.week.start, { data: current, fetchedAt: 200, checkedAt: 300, changedAt: 200 }]]);
      assert.deepEqual(getFreshIncomingWeeks([current, next], 100, stored), [next]);
      assert.deepEqual(getFreshIncomingWeeks([current], 200, stored), [current]);
      assert.deepEqual(getFreshIncomingWeeks([current], 400, stored), [current]);
   });
   void it("does not move a class back when its older source week arrives late", () => {
      const source = week("2026-06-15");
      const destination = week("2026-06-22");
      const movedClass = {
         id: "moved",
         title: "Programming",
         subject: "",
         teacher: "",
         room: "A1",
         location: "",
         description: "",
         start: "2026-06-23T09:00:00",
         end: "2026-06-23T10:00:00",
         status: "scheduled" as const,
      };
      destination.classes = [movedClass];
      const oldSource = { ...source, classes: [{ ...movedClass, start: "2026-06-16T09:00:00", end: "2026-06-16T10:00:00" }] };
      const stored = new Map([
         [source.week.start, { data: source, fetchedAt: 100, checkedAt: 100, changedAt: 300 }],
         [destination.week.start, { data: destination, fetchedAt: 300, checkedAt: 300, changedAt: 300 }],
      ]);
      const raw = new Map([...stored].map(([date, entry]) => [date, entry.data]));
      const result = reconcileWeeks(raw, getFreshIncomingWeeks([oldSource], 200, stored), new Map());
      assert.deepEqual(result.rawWeeks.get(source.week.start)?.classes, []);
      assert.deepEqual(result.rawWeeks.get(destination.week.start)?.classes, [movedClass]);
      assert.deepEqual(result.notifications, []);
      assert.deepEqual(getFreshIncomingWeeks([oldSource], 400, stored), [oldSource]);
   });
});
void describe("date and account scoped persistence", () => {
   afterEach(() => {
      delete (globalThis as { window?: unknown }).window;
   });
   void it("retires legacy caches that have no account namespace", () => {
      const storage = installStorage();
      storage.setItem("roster-current-week-cache-v2", "old account data");
      storage.setItem("roster-last-week-cache-v1", "old account data");
      assert.equal(readWeekCache(), null);
      assert.equal(storage.getItem("roster-current-week-cache-v2"), null);
      assert.equal(storage.getItem("roster-last-week-cache-v1"), null);
   });
   void it("retains future weeks and all three timestamps across hydration", () => {
      installStorage();
      const cache = {
         contextId: "A",
         timeZone: "Europe/Amsterdam",
         weeks: [0, 7, 14].map((days) => ({ data: week(shiftCalendarDate("2026-06-15", days)), fetchedAt: 100, checkedAt: 200, changedAt: 50 })),
      };
      storeWeekCache(cache, "2026-06-15");
      assert.deepEqual(readWeekCache(), cache);
   });
   void it("bounds saved weeks and retains current and previous weeks", () => {
      installStorage();
      storeWeekCache(
         {
            contextId: "A",
            timeZone: "Europe/Amsterdam",
            weeks: Array.from({ length: 52 }, (_, index) => ({
               data: week(shiftCalendarDate("2026-06-08", index * 7)),
               fetchedAt: index + 1,
               checkedAt: index + 1,
               changedAt: index + 1,
            })),
         },
         "2026-06-15"
      );
      const stored = readWeekCache();
      assert.equal(stored?.weeks.length, 32);
      assert.ok(stored.weeks.some((row) => row.data.week.start === "2026-06-15"));
      assert.ok(stored.weeks.some((row) => row.data.week.start === "2026-06-08"));
   });
   void it("discards corrupt cached data", () => {
      const storage = installStorage();
      storage.setItem(WEEK_CACHE_KEY, '{"contextId":"A","timeZone":"Europe/Amsterdam","weeks":[{}]}');
      assert.equal(readWeekCache(), null);
      assert.equal(storage.getItem(WEEK_CACHE_KEY), null);
   });
   void it("restores removals only in their original account, zone and dated week", () => {
      installStorage();
      const old = week("2026-06-15");
      old.classes.push({
         id: "one",
         title: "Programming",
         subject: "",
         start: "2026-06-16T09:00:00",
         end: "2026-06-16T10:00:00",
         room: "A1",
         teacher: "",
         location: "",
         description: "",
         status: "scheduled",
      });
      const empty = week("2026-06-15");
      const result = reconcileWeeks(new Map([[old.week.start, old]]), [empty], new Map());
      storeSessionClassDiffs(result.changes, "A", "Europe/Amsterdam");
      const restored = readSessionClassDiffs("A", "Europe/Amsterdam");
      assert.equal(applySessionClassDiffs(empty, restored).classes[0]?.status, "cancelled");
      assert.equal(applySessionClassDiffs(week("2026-06-22"), restored).classes.length, 0);
      assert.equal(readSessionClassDiffs("B", "Europe/Amsterdam").size, 0);
      assert.equal(readSessionClassDiffs("A", "Asia/Tokyo").size, 0);
   });
});
