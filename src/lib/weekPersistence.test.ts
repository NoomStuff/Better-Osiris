import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import type { Class, Week } from "../types/weeks";
import { getIsoWeekNumber, getLocalWeekStartIso, shiftIsoDateByDays } from "./date.js";
import { setRosterTimeZone } from "./rosterTimeZone.js";
import { readCachedCurrentWeek, readCachedLastWeek, readSessionClassDiffs, storeCachedCurrentWeek, storeSessionClassDiffs } from "./weekPersistence.js";
import { CURRENT_WEEK_CACHE_KEY, LAST_WEEK_CACHE_KEY, SESSION_CLASS_DIFFS_KEY } from "./weekCache.js";

class MemoryStorage {
   private readonly items = new Map<string, string>();

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
   const sessionStorage = new MemoryStorage();
   (globalThis as { window?: unknown }).window = { localStorage, sessionStorage };
   return { localStorage, sessionStorage };
}

function createClass(overrides: Partial<Class> = {}): Class {
   return {
      id: "class-1",
      title: "Web Development",
      subject: "Programming",
      start: "2026-06-16T09:00:00",
      end: "2026-06-16T10:30:00",
      teacher: "J. Janssen",
      room: "A101",
      location: "Main building",
      description: "",
      status: "scheduled",
      ...overrides,
   };
}

function createRosterResponse(weekStart: string): Week {
   return {
      week: { offset: 0, number: getIsoWeekNumber(weekStart), start: weekStart, end: shiftIsoDateByDays(weekStart, 4) },
      classes: [createClass()],
   };
}

void describe("roster persistence", () => {
   beforeEach(() => {
      setRosterTimeZone("Europe/Amsterdam");
   });

   afterEach(() => {
      delete (globalThis as { window?: unknown }).window;
   });

   void it("round-trips the current week through localStorage", () => {
      installStorage();
      const data = createRosterResponse(getLocalWeekStartIso(new Date()));

      storeCachedCurrentWeek(data);
      const cached = readCachedCurrentWeek();
      assert.ok(cached);

      assert.deepEqual(cached.week, { ...data.week, offset: 0 });
      assert.deepEqual(cached.classes, data.classes);
   });

   void it("rejects and removes cached weeks that no longer match the current ISO week", () => {
      const { localStorage } = installStorage();
      const staleStart = shiftIsoDateByDays(getLocalWeekStartIso(new Date()), -14);
      localStorage.setItem(CURRENT_WEEK_CACHE_KEY, JSON.stringify(createRosterResponse(staleStart)));

      const cached = readCachedCurrentWeek();

      assert.equal(cached, null);
      assert.equal(localStorage.getItem(CURRENT_WEEK_CACHE_KEY), null);
   });

   void it("removes corrupt cache entries instead of crashing", () => {
      const { localStorage } = installStorage();
      localStorage.setItem(CURRENT_WEEK_CACHE_KEY, "definitely not json");

      const cached = readCachedCurrentWeek();

      assert.equal(cached, null);
      assert.equal(localStorage.getItem(CURRENT_WEEK_CACHE_KEY), null);
   });

   void it("promotes the stored current week to last week when the ISO week rolls over", () => {
      const { localStorage } = installStorage();
      const lastWeekStart = shiftIsoDateByDays(getLocalWeekStartIso(new Date()), -7);
      localStorage.setItem(CURRENT_WEEK_CACHE_KEY, JSON.stringify(createRosterResponse(lastWeekStart)));

      const lastWeek = readCachedLastWeek();
      assert.ok(lastWeek);

      assert.equal(lastWeek.week.offset, -1);
      assert.equal(lastWeek.week.start, lastWeekStart);
      assert.equal(localStorage.getItem(CURRENT_WEEK_CACHE_KEY), null);
      assert.notEqual(localStorage.getItem(LAST_WEEK_CACHE_KEY), null);
   });

   void it("round-trips session schoolClass diffs through sessionStorage", () => {
      installStorage();
      const schoolClass = createClass({ status: "changed" });
      const previousClass = createClass();
      const diffs = new Map([[0, new Map([["class-1", { schoolClass, previousClass, status: "changed" as const }]])]]);

      storeSessionClassDiffs(diffs);
      const restored = readSessionClassDiffs();

      const restoredWeekDiffs = restored.get(0);
      assert.ok(restoredWeekDiffs);
      const restoredDiff = restoredWeekDiffs.get("class-1");
      assert.ok(restoredDiff);
      assert.deepEqual(restoredDiff.schoolClass, schoolClass);
      assert.deepEqual(restoredDiff.previousClass, previousClass);
      assert.equal(restoredDiff.status, "changed");
   });

   void it("round-trips an added session schoolClass without a previous snapshot", () => {
      installStorage();
      const schoolClass = createClass({ status: "added" });
      const diffs = new Map([[0, new Map([["class-1", { schoolClass, status: "added" as const }]])]]);

      storeSessionClassDiffs(diffs);
      const restored = readSessionClassDiffs().get(0)?.get("class-1");

      assert.ok(restored);
      assert.equal(restored.status, "added");
      assert.equal(restored.previousClass, undefined);
      assert.deepEqual(restored.schoolClass, schoolClass);
   });

   void it("discards unreadable session diffs and clears storage", () => {
      const { sessionStorage } = installStorage();
      sessionStorage.setItem(SESSION_CLASS_DIFFS_KEY, '{"0":[{"status":"exploded"}]}');

      const restored = readSessionClassDiffs();

      assert.equal(restored.size, 0);
      assert.equal(sessionStorage.getItem(SESSION_CLASS_DIFFS_KEY), null);
   });
});
