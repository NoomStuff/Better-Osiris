import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applyDevLessonStatusPreview } from "./devRosterStatusPreview.js";
import type { Lesson, RosterResponse } from "../types/roster";

void describe("dev roster status preview", () => {
   void it("leaves roster data untouched when disabled", () => {
      const week = createWeek();

      assert.equal(applyDevLessonStatusPreview(week, "none"), week);
   });

   void it("can preview changed, cancelled, and mixed status states", () => {
      const week = createWeek();

      assert.deepEqual(
         applyDevLessonStatusPreview(week, "changed")?.lessons.map((lesson) => lesson.status),
         ["changed", "scheduled"]
      );
      assert.deepEqual(
         applyDevLessonStatusPreview(week, "cancelled")?.lessons.map((lesson) => lesson.status),
         ["cancelled", "scheduled"]
      );
      assert.deepEqual(
         applyDevLessonStatusPreview(week, "mixed")?.lessons.map((lesson) => lesson.status),
         ["changed", "cancelled"]
      );
      assert.equal(applyDevLessonStatusPreview(week, "changed")?.lessons[0]?.previous?.room, "B12");
   });
});

function createWeek(): RosterResponse {
   return {
      week: {
         offset: 0,
         number: 25,
         start: "2026-06-15",
         end: "2026-06-19",
      },
      lessons: [createLesson("one"), createLesson("two")],
   };
}

function createLesson(id: string): Lesson {
   return {
      id,
      title: "Programming",
      subject: "TypeScript",
      start: "2026-06-16T09:00:00",
      end: "2026-06-16T10:30:00",
      teacher: "Teacher",
      room: "A101",
      location: "Main building",
      description: "Lesson",
      status: "scheduled",
   };
}
