import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applySessionClassDiffs, recordSessionClassDiffs, type SessionClassDiffsByWeek } from "./classDiffs.js";
import type { Class, Week } from "../types/weeks";

void describe("session roster diff states", () => {
   void it("keeps same-id schoolClass edits marked as changed across later refreshes", () => {
      const previous = createWeek([createClass({ id: "class-1", room: "A101" })]);
      const next = createWeek([createClass({ id: "class-1", room: "B202" })]);
      const later = createWeek([createClass({ id: "class-1", room: "B202" })]);
      const diffs: SessionClassDiffsByWeek = new Map();

      recordSessionClassDiffs(previous, next, diffs);

      const displayNext = applySessionClassDiffs(next, diffs);
      const displayLater = applySessionClassDiffs(later, diffs);
      const displayedNextClass = displayNext.classes[0];
      const displayedLaterClass = displayLater.classes[0];

      assert.equal(displayedNextClass?.status, "changed");
      assert.equal(displayedNextClass.previous?.room, "A101");
      assert.equal(displayedLaterClass?.status, "changed");
      assert.equal(displayedLaterClass.previous?.room, "A101");
   });

   void it("keeps removed classes visible as cancelled", () => {
      const previous = createWeek([createClass({ id: "class-1" }), createClass({ id: "class-2", title: "Databases" })]);
      const next = createWeek([createClass({ id: "class-2", title: "Databases" })]);
      const diffs: SessionClassDiffsByWeek = new Map();

      recordSessionClassDiffs(previous, next, diffs);

      const display = applySessionClassDiffs(next, diffs);
      const cancelledClass = display.classes.find((schoolClass) => schoolClass.id === "class-1");

      assert.equal(display.classes.length, 2);
      assert.equal(cancelledClass?.status, "cancelled");
   });

   void it("marks likely moved replacement classes as changed", () => {
      const previous = createWeek([createClass({ id: "old-id", start: "2026-06-16T09:00:00", end: "2026-06-16T10:30:00" })]);
      const next = createWeek([createClass({ id: "new-id", start: "2026-06-16T13:00:00", end: "2026-06-16T14:30:00" })]);
      const diffs: SessionClassDiffsByWeek = new Map();

      recordSessionClassDiffs(previous, next, diffs);

      const display = applySessionClassDiffs(next, diffs);

      assert.equal(
         display.classes.find((schoolClass) => schoolClass.id === "old-id"),
         undefined
      );
      assert.equal(display.classes.find((schoolClass) => schoolClass.id === "new-id")?.status, "changed");
      assert.equal(display.classes.find((schoolClass) => schoolClass.id === "new-id")?.previous?.start, "2026-06-16T09:00:00");
   });

   void it("preserves the first original snapshot across multiple edits", () => {
      const first = createWeek([createClass({ room: "A101" })]);
      const second = createWeek([createClass({ room: "B202" })]);
      const third = createWeek([createClass({ room: "C303" })]);
      const diffs: SessionClassDiffsByWeek = new Map();

      recordSessionClassDiffs(first, second, diffs);
      recordSessionClassDiffs(second, third, diffs);

      const display = applySessionClassDiffs(third, diffs);
      const displayedClass = display.classes[0];

      assert.equal(displayedClass?.previous?.room, "A101");
      assert.equal(displayedClass.room, "C303");
   });

   void it("records a native OSIRIS cancellation on a schoolClass that remains in the payload", () => {
      const previous = createWeek([createClass()]);
      const next = createWeek([createClass({ status: "cancelled" })]);
      const diffs: SessionClassDiffsByWeek = new Map();

      const recorded = recordSessionClassDiffs(previous, next, diffs);
      const display = applySessionClassDiffs(next, diffs);

      assert.equal(recorded[0]?.status, "cancelled");
      assert.equal(display.classes[0]?.status, "cancelled");
   });

   void it("removes a session change when the schoolClass returns to its original state", () => {
      const original = createWeek([createClass({ id: "class-1" })]);
      const changed = createWeek([createClass({ id: "class-1", room: "B202" })]);
      const diffs: SessionClassDiffsByWeek = new Map();

      recordSessionClassDiffs(original, changed, diffs);
      assert.equal(diffs.get(0)?.size, 1);
      recordSessionClassDiffs(changed, original, diffs);
      assert.equal(diffs.size, 0);
      assert.equal(applySessionClassDiffs(original, diffs).classes[0]?.status, "scheduled");
   });

   void it("clears an ID-changing move when the original schoolClass returns", () => {
      const original = createWeek([createClass({ id: "old-id", start: "2026-06-16T09:00:00", end: "2026-06-16T10:30:00" })]);
      const moved = createWeek([createClass({ id: "new-id", start: "2026-06-16T13:00:00", end: "2026-06-16T14:30:00" })]);
      const diffs: SessionClassDiffsByWeek = new Map();

      recordSessionClassDiffs(original, moved, diffs);
      recordSessionClassDiffs(moved, original, diffs);

      const display = applySessionClassDiffs(original, diffs);
      assert.equal(diffs.size, 0);
      assert.equal(display.classes.length, 1);
      const revertedLesson = display.classes[0];
      assert.ok(revertedLesson);
      assert.equal(revertedLesson.id, "old-id");
      assert.equal(revertedLesson.status, "scheduled");
   });

   void it("does not guess when multiple removed classes are equally plausible", () => {
      const first = createClass({ id: "first", title: "Math", subject: "Math", teacher: "Teacher" });
      const second = createClass({ id: "second", title: "Math", subject: "Math", teacher: "Teacher" });
      const replacement = createClass({ id: "replacement", title: "Math", subject: "Math", teacher: "Teacher" });
      const diffs: SessionClassDiffsByWeek = new Map();

      const recorded = recordSessionClassDiffs(createWeek([first, second]), createWeek([replacement]), diffs);
      assert.equal(
         recorded.some((diff) => diff.schoolClass.id === "replacement" && diff.status === "changed"),
         false
      );
   });
});

function createWeek(classes: Class[]): Week {
   return {
      week: {
         offset: 0,
         number: 25,
         start: "2026-06-15",
         end: "2026-06-19",
      },
      classes,
   };
}

function createClass(overrides: Partial<Class> = {}): Class {
   return {
      id: "schoolClass",
      title: "Programming",
      subject: "TypeScript",
      start: "2026-06-16T09:00:00",
      end: "2026-06-16T10:30:00",
      teacher: "Teacher",
      room: "A101",
      location: "Main building",
      description: "Class",
      status: "scheduled",
      ...overrides,
   };
}
