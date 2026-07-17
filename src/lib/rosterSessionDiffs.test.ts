import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applySessionLessonDiffs, recordSessionLessonDiffs, type SessionLessonDiffsByWeek } from "./rosterSessionDiffs.js";
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
      const displayedNextLesson = displayNext.lessons[0];
      const displayedLaterLesson = displayLater.lessons[0];

      assert.equal(displayedNextLesson?.status, "changed");
      assert.equal(displayedNextLesson.previous?.room, "A101");
      assert.equal(displayedLaterLesson?.status, "changed");
      assert.equal(displayedLaterLesson.previous?.room, "A101");
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

      assert.equal(
         display.lessons.find((lesson) => lesson.id === "old-id"),
         undefined
      );
      assert.equal(display.lessons.find((lesson) => lesson.id === "new-id")?.status, "changed");
      assert.equal(display.lessons.find((lesson) => lesson.id === "new-id")?.previous?.start, "2026-06-16T09:00:00");
   });

   void it("preserves the first original snapshot across multiple edits", () => {
      const first = createWeek([createLesson({ room: "A101" })]);
      const second = createWeek([createLesson({ room: "B202" })]);
      const third = createWeek([createLesson({ room: "C303" })]);
      const diffs: SessionLessonDiffsByWeek = new Map();

      recordSessionLessonDiffs(first, second, diffs);
      recordSessionLessonDiffs(second, third, diffs);

      const display = applySessionLessonDiffs(third, diffs);
      const displayedLesson = display.lessons[0];

      assert.equal(displayedLesson?.previous?.room, "A101");
      assert.equal(displayedLesson.room, "C303");
   });

   void it("records a native OSIRIS cancellation on a lesson that remains in the payload", () => {
      const previous = createWeek([createLesson()]);
      const next = createWeek([createLesson({ status: "cancelled" })]);
      const diffs: SessionLessonDiffsByWeek = new Map();

      const recorded = recordSessionLessonDiffs(previous, next, diffs);
      const display = applySessionLessonDiffs(next, diffs);

      assert.equal(recorded[0]?.status, "cancelled");
      assert.equal(display.lessons[0]?.status, "cancelled");
   });

   void it("removes a session change when the lesson returns to its original state", () => {
      const original = createWeek([createLesson({ id: "lesson-1" })]);
      const changed = createWeek([createLesson({ id: "lesson-1", room: "B202" })]);
      const diffs: SessionLessonDiffsByWeek = new Map();

      recordSessionLessonDiffs(original, changed, diffs);
      assert.equal(diffs.get(0)?.size, 1);
      recordSessionLessonDiffs(changed, original, diffs);
      assert.equal(diffs.size, 0);
      assert.equal(applySessionLessonDiffs(original, diffs).lessons[0]?.status, "scheduled");
   });

   void it("clears an ID-changing move when the original lesson returns", () => {
      const original = createWeek([createLesson({ id: "old-id", start: "2026-06-16T09:00:00", end: "2026-06-16T10:30:00" })]);
      const moved = createWeek([createLesson({ id: "new-id", start: "2026-06-16T13:00:00", end: "2026-06-16T14:30:00" })]);
      const diffs: SessionLessonDiffsByWeek = new Map();

      recordSessionLessonDiffs(original, moved, diffs);
      recordSessionLessonDiffs(moved, original, diffs);

      const display = applySessionLessonDiffs(original, diffs);
      assert.equal(diffs.size, 0);
      assert.equal(display.lessons.length, 1);
      const revertedLesson = display.lessons[0];
      assert.ok(revertedLesson);
      assert.equal(revertedLesson.id, "old-id");
      assert.equal(revertedLesson.status, "scheduled");
   });

   void it("does not guess when multiple removed lessons are equally plausible", () => {
      const first = createLesson({ id: "first", title: "Math", subject: "Math", teacher: "Teacher" });
      const second = createLesson({ id: "second", title: "Math", subject: "Math", teacher: "Teacher" });
      const replacement = createLesson({ id: "replacement", title: "Math", subject: "Math", teacher: "Teacher" });
      const diffs: SessionLessonDiffsByWeek = new Map();

      const recorded = recordSessionLessonDiffs(createWeek([first, second]), createWeek([replacement]), diffs);
      assert.equal(
         recorded.some((diff) => diff.lesson.id === "replacement" && diff.status === "changed"),
         false
      );
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
