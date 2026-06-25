import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applySessionLessonDiffs, recordSessionLessonDiffs, type SessionLessonDiffsByWeek } from "../lib/rosterSessionDiffs.js";
import type { Lesson, RosterResponse } from "../types/roster";

void describe("session roster diff states", () => {
   void it("keeps same-id lesson edits marked as changed across later refreshes", () => {
      const previous = createWeek([createLesson({ id: "lesson-1", room: "A101" })]);
      const next = createWeek([createLesson({ id: "lesson-1", room: "B202" })]);
      const later = createWeek([createLesson({ id: "lesson-1", room: "B202" })]);
      const diffs: SessionLessonDiffsByWeek = new Map();

      recordSessionLessonDiffs(previous, next, diffs);

      const displayNext = applySessionLessonDiffs(next, diffs);
      const displayLater = applySessionLessonDiffs(later, diffs);

      assert.equal(displayNext.lessons[0]?.status, "changed");
      assert.equal(displayLater.lessons[0]?.status, "changed");
   });

   void it("keeps removed lessons visible as cancelled", () => {
      const previous = createWeek([createLesson({ id: "lesson-1" }), createLesson({ id: "lesson-2", title: "Databases" })]);
      const next = createWeek([createLesson({ id: "lesson-2", title: "Databases" })]);
      const diffs: SessionLessonDiffsByWeek = new Map();

      recordSessionLessonDiffs(previous, next, diffs);

      const display = applySessionLessonDiffs(next, diffs);
      const cancelledLesson = display.lessons.find((lesson) => lesson.id === "lesson-1");

      assert.equal(display.lessons.length, 2);
      assert.equal(cancelledLesson?.status, "cancelled");
   });

   void it("marks likely moved replacement lessons as changed", () => {
      const previous = createWeek([createLesson({ id: "old-id", start: "2026-06-16T09:00:00", end: "2026-06-16T10:30:00" })]);
      const next = createWeek([createLesson({ id: "new-id", start: "2026-06-16T13:00:00", end: "2026-06-16T14:30:00" })]);
      const diffs: SessionLessonDiffsByWeek = new Map();

      recordSessionLessonDiffs(previous, next, diffs);

      const display = applySessionLessonDiffs(next, diffs);

      assert.equal(display.lessons.find((lesson) => lesson.id === "old-id")?.status, "cancelled");
      assert.equal(display.lessons.find((lesson) => lesson.id === "new-id")?.status, "changed");
   });
});

function createWeek(lessons: Lesson[]): RosterResponse {
   return {
      week: {
         offset: 0,
         number: 25,
         start: "2026-06-15",
         end: "2026-06-19",
      },
      lessons,
      source: {
         mode: "osiris",
         note: "Fixture",
      },
   };
}

function createLesson(overrides: Partial<Lesson> = {}): Lesson {
   return {
      id: "lesson",
      title: "Programming",
      subject: "TypeScript",
      start: "2026-06-16T09:00:00",
      end: "2026-06-16T10:30:00",
      teacher: "Teacher",
      room: "A101",
      location: "Main building",
      description: "Lesson",
      status: "scheduled",
      ...overrides,
   };
}
