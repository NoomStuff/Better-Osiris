import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isSameLessonDetails, toLessonSnapshot } from "./lessonSnapshot.js";
import type { Lesson } from "../types/roster";

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

void describe("lesson snapshots", () => {
   void it("captures every visible lesson field", () => {
      const lesson = createLesson();

      assert.deepEqual(toLessonSnapshot(lesson), {
         id: lesson.id,
         title: lesson.title,
         subject: lesson.subject,
         start: lesson.start,
         end: lesson.end,
         teacher: lesson.teacher,
         room: lesson.room,
         location: lesson.location,
         description: lesson.description,
         status: lesson.status,
      });
   });

   void it("treats lessons with identical details as the same", () => {
      assert.equal(isSameLessonDetails(createLesson(), createLesson()), true);
   });

   void it("ignores id and status when comparing details", () => {
      assert.equal(isSameLessonDetails(createLesson(), createLesson({ id: "other", status: "cancelled" })), true);
   });

   void it("detects a changed visible field", () => {
      assert.equal(isSameLessonDetails(createLesson(), createLesson({ room: "B202" })), false);
      assert.equal(isSameLessonDetails(createLesson(), createLesson({ start: "2026-06-16T10:00:00" })), false);
   });
});
