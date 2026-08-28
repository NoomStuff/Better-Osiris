import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getMinutesFromMidnight, toDayKey } from "./date.js";
import { getDayGroups, getPositionedLessons } from "./rosterLayout.js";
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

void describe("roster layout", () => {
   void it("positions valid lessons with parsed dates and day keys", () => {
      const positioned = getPositionedLessons([createLesson()]);
      const first = positioned.at(0);
      assert.ok(first);

      assert.equal(positioned.length, 1);
      assert.equal(first.dayKey, "2026-06-16");
      // Wall-clock time must be read in the Amsterdam schedule timezone, not the machine timezone.
      assert.equal(getMinutesFromMidnight(first.startDate), 9 * 60);
      assert.equal(toDayKey(first.endDate), "2026-06-16");
      assert.equal(first.overlapCount, 1);
      assert.equal(first.overlapIndex, 0);
   });

   void it("drops lessons with an end before or equal to their start", () => {
      const positioned = getPositionedLessons([
         createLesson({ id: "reversed", start: "2026-06-16T10:30:00", end: "2026-06-16T09:00:00" }),
         createLesson({ id: "zero-length", start: "2026-06-16T09:00:00", end: "2026-06-16T09:00:00" }),
      ]);

      assert.deepEqual(
         positioned.map((lesson) => lesson.id),
         []
      );
   });

   void it("places overlapping lessons side by side in columns", () => {
      const positioned = getPositionedLessons([
         createLesson({ id: "first", start: "2026-06-16T09:00:00", end: "2026-06-16T10:30:00" }),
         createLesson({ id: "second", start: "2026-06-16T09:30:00", end: "2026-06-16T11:00:00" }),
      ]);

      assert.equal(positioned.find((lesson) => lesson.id === "first")?.overlapIndex, 0);
      assert.equal(positioned.find((lesson) => lesson.id === "second")?.overlapIndex, 1);
      assert.deepEqual(
         positioned.map((lesson) => lesson.overlapCount),
         [2, 2]
      );
   });

   void it("keeps sequential lessons out of overlap clusters", () => {
      const positioned = getPositionedLessons([
         createLesson({ id: "first", start: "2026-06-16T09:00:00", end: "2026-06-16T10:00:00" }),
         createLesson({ id: "second", start: "2026-06-16T10:00:00", end: "2026-06-16T11:00:00" }),
      ]);

      assert.deepEqual(
         positioned.map((lesson) => lesson.overlapCount),
         [1, 1]
      );
   });

   void it("closes a cluster once no lesson overlaps the running columns", () => {
      const positioned = getPositionedLessons([
         createLesson({ id: "a", start: "2026-06-16T09:00:00", end: "2026-06-16T10:00:00" }),
         createLesson({ id: "b", start: "2026-06-16T09:30:00", end: "2026-06-16T10:30:00" }),
         createLesson({ id: "c", start: "2026-06-16T10:00:00", end: "2026-06-16T11:00:00" }),
         createLesson({ id: "d", start: "2026-06-16T11:00:00", end: "2026-06-16T12:00:00" }),
      ]);

      // a, b and c form one cluster (b still runs when c starts); d starts after the cluster ends.
      assert.deepEqual(
         positioned.map((lesson) => [lesson.id, lesson.overlapIndex, lesson.overlapCount]),
         [
            ["a", 0, 2],
            ["b", 1, 2],
            ["c", 0, 2],
            ["d", 0, 1],
         ]
      );
   });

   void it("keeps lessons from different days in separate clusters", () => {
      const positioned = getPositionedLessons([
         createLesson({ id: "tuesday", start: "2026-06-16T09:00:00", end: "2026-06-16T10:30:00" }),
         createLesson({ id: "wednesday", start: "2026-06-17T09:30:00", end: "2026-06-17T11:00:00" }),
      ]);

      assert.deepEqual(
         positioned.map((lesson) => lesson.overlapCount),
         [1, 1]
      );
   });

   void it("groups positioned lessons into five weekday columns", () => {
      const week = { offset: 0, number: 25, start: "2026-06-15", end: "2026-06-21" };
      const positioned = getPositionedLessons([
         createLesson({ id: "late", start: "2026-06-16T13:00:00", end: "2026-06-16T14:00:00" }),
         createLesson({ id: "early", start: "2026-06-16T09:00:00", end: "2026-06-16T10:30:00" }),
         createLesson({ id: "weekend-ignored", start: "2026-06-20T09:00:00", end: "2026-06-20T10:00:00" }),
      ]);

      const groups = getDayGroups(week, positioned);

      assert.equal(groups.length, 5);
      assert.deepEqual(
         groups.map((group) => group.key),
         ["2026-06-15", "2026-06-16", "2026-06-17", "2026-06-18", "2026-06-19"]
      );
      const tuesday = groups.at(1);
      assert.ok(tuesday);
      assert.deepEqual(
         tuesday.lessons.map((lesson) => lesson.id),
         ["early", "late"]
      );
      const wednesday = groups.at(2);
      assert.ok(wednesday);
      assert.equal(wednesday.lessons.length, 0);
   });

   void it("sorts lessons within a day chronologically", () => {
      const week = { offset: 0, number: 25, start: "2026-06-15", end: "2026-06-21" };
      const positioned = getPositionedLessons([
         createLesson({ id: "later", start: "2026-06-16T14:00:00", end: "2026-06-16T15:00:00" }),
         createLesson({ id: "earlier", start: "2026-06-16T09:00:00", end: "2026-06-16T10:00:00" }),
      ]);

      const groups = getDayGroups(week, positioned);
      const tuesday = groups.at(1);
      assert.ok(tuesday);
      assert.deepEqual(
         tuesday.lessons.map((lesson) => lesson.id),
         ["earlier", "later"]
      );
   });
});
