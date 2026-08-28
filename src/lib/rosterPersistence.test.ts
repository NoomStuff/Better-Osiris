import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import type { Lesson, RosterResponse } from "../types/roster";
import { getIsoWeekNumber, getLocalWeekStartIso, shiftIsoDateByDays } from "./date.js";
import { readCachedCurrentWeek, readCachedLastWeek, readSessionLessonDiffs, storeCachedCurrentWeek, storeSessionLessonDiffs } from "./rosterPersistence.js";
import { CURRENT_WEEK_CACHE_KEY, LAST_WEEK_CACHE_KEY, SESSION_LESSON_DIFFS_KEY } from "./rosterCache.js";

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

function createLesson(overrides: Partial<Lesson> = {}): Lesson {
   return {
      id: "lesson-1",
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

function createRosterResponse(weekStart: string): RosterResponse {
   return {
      week: { offset: 0, number: getIsoWeekNumber(weekStart), start: weekStart, end: shiftIsoDateByDays(weekStart, 4) },
      lessons: [createLesson()],
   };
}

void describe("roster persistence", () => {
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
      assert.deepEqual(cached.lessons, data.lessons);
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

   void it("round-trips session lesson diffs through sessionStorage", () => {
      installStorage();
      const lesson = createLesson({ status: "changed" });
      const previousLesson = createLesson();
      const diffs = new Map([[0, new Map([["lesson-1", { lesson, previousLesson, status: "changed" as const }]])]]);

      storeSessionLessonDiffs(diffs);
      const restored = readSessionLessonDiffs();

      const restoredWeekDiffs = restored.get(0);
      assert.ok(restoredWeekDiffs);
      const restoredDiff = restoredWeekDiffs.get("lesson-1");
      assert.ok(restoredDiff);
      assert.deepEqual(restoredDiff.lesson, lesson);
      assert.deepEqual(restoredDiff.previousLesson, previousLesson);
      assert.equal(restoredDiff.status, "changed");
   });

   void it("discards unreadable session diffs and clears storage", () => {
      const { sessionStorage } = installStorage();
      sessionStorage.setItem(SESSION_LESSON_DIFFS_KEY, '{"0":[{"status":"exploded"}]}');

      const restored = readSessionLessonDiffs();

      assert.equal(restored.size, 0);
      assert.equal(sessionStorage.getItem(SESSION_LESSON_DIFFS_KEY), null);
   });
});
