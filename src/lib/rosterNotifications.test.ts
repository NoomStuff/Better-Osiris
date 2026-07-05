import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getRosterNotificationBodies } from "./rosterNotifications.js";
import type { SessionLessonDiff } from "./rosterSessionDiffs.js";
import type { Lesson, LessonSnapshot } from "../types/roster";

void describe("roster desktop notification messages", () => {
   void it("describes a single cancellation with its day and start time", () => {
      const diff = createDiff("cancelled");

      assert.deepEqual(getRosterNotificationBodies([diff]), ["Web Development was cancelled: Tuesday 10:30"]);
   });

   void it("uses the most useful changed field for a single changed lesson", () => {
      const diff = createDiff("changed", { room: "C04" }, { room: "B12" });

      assert.deepEqual(getRosterNotificationBodies([diff]), ["Web Development changed: B12 → C04"]);
   });

   void it("groups multiple changes by status", () => {
      const diffs = [
         createDiff("cancelled"),
         createDiff("cancelled", { id: "cancelled-2" }),
         createDiff("cancelled", { id: "cancelled-3" }),
         createDiff("changed", { id: "changed-1", room: "C04" }, { id: "changed-1", room: "B12" }),
         createDiff("changed", { id: "changed-2", room: "D05" }, { id: "changed-2", room: "A01" }),
      ];

      assert.deepEqual(getRosterNotificationBodies(diffs), ["3 classes were cancelled", "2 classes were changed"]);
   });
});

function createDiff(status: "changed" | "cancelled", lessonOverrides: Partial<Lesson> = {}, previousOverrides: Partial<LessonSnapshot> = {}) {
   const lesson = createLesson(lessonOverrides);
   const previousLesson: LessonSnapshot = {
      ...lesson,
      ...previousOverrides,
      status: "scheduled",
   };

   return {
      lesson: { ...lesson, status, previous: previousLesson },
      previousLesson,
      status,
   } satisfies SessionLessonDiff;
}

function createLesson(overrides: Partial<Lesson> = {}): Lesson {
   return {
      id: "lesson",
      title: "Web Development",
      subject: "TypeScript",
      start: "2026-06-16T10:30:00+02:00",
      end: "2026-06-16T12:00:00+02:00",
      teacher: "Teacher",
      room: "B12",
      location: "Main building",
      description: "Lesson",
      status: "scheduled",
      ...overrides,
   };
}
