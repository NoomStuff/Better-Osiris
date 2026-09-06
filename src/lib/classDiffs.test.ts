import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applySessionClassDiffs, recordSessionClassDiffs, type SessionClassDiffsByWeek } from "./classDiffs.js";
import type { Class, Week } from "../types/weeks";

void describe("session roster diff states", () => {
   void it("retains a previously confirmed cancellation when the upstream row disappears", () => {
      const previous = createWeek([createClass({ status: "cancelled" })]);
      const next = createWeek([]);
      const changes: SessionClassDiffsByWeek = new Map();
      assert.deepEqual(recordSessionClassDiffs(previous, next, changes), []);
      assert.equal(applySessionClassDiffs(next, changes).classes[0]?.status, "cancelled");
   });

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
      assert.equal(displayedNextClass.previous.room, "A101");
      assert.equal(displayedLaterClass?.status, "changed");
      assert.equal(displayedLaterClass.previous.room, "A101");
   });

   void it("keeps classes that vanish from the roster visible as cancelled", () => {
      const previous = createWeek([createClass({ id: "class-1" }), createClass({ id: "class-2", title: "Databases" })]);
      const next = createWeek([createClass({ id: "class-2", title: "Databases" })]);
      const diffs: SessionClassDiffsByWeek = new Map();

      recordSessionClassDiffs(previous, next, diffs);

      const display = applySessionClassDiffs(next, diffs);
      const cancelledClass = display.classes.find((schoolClass) => schoolClass.id === "class-1");

      assert.equal(display.classes.length, 2);
      assert.equal(cancelledClass?.status, "cancelled");
   });

   void it("does not infer identity from a similar replacement", () => {
      const previous = createWeek([createClass({ id: "old-id", start: "2026-06-16T09:00:00", end: "2026-06-16T10:30:00" })]);
      const next = createWeek([createClass({ id: "new-id", start: "2026-06-16T13:00:00", end: "2026-06-16T14:30:00" })]);
      const diffs: SessionClassDiffsByWeek = new Map();

      recordSessionClassDiffs(previous, next, diffs);

      const display = applySessionClassDiffs(next, diffs);

      assert.equal(display.classes.find((item) => item.id === "old-id")?.status, "cancelled");
      assert.equal(display.classes.find((item) => item.id === "new-id")?.status, "added");
      assert.equal(display.classes.find((item) => item.id === "new-id")?.previous, undefined);
   });

   void it("marks unmatched new classes as added without inventing a previous snapshot", () => {
      const previous = createWeek([createClass({ id: "existing" })]);
      const added = createClass({ id: "new-class", title: "Databases", subject: "SQL" });
      const next = createWeek([createClass({ id: "existing" }), added]);
      const diffs: SessionClassDiffsByWeek = new Map();

      const recorded = recordSessionClassDiffs(previous, next, diffs);
      const displayed = applySessionClassDiffs(next, diffs).classes.find((schoolClass) => schoolClass.id === added.id);

      assert.equal(recorded.find((diff) => diff.schoolClass.id === added.id)?.status, "added");
      assert.equal(displayed?.status, "added");
      assert.equal(displayed.previous, undefined);
   });

   void it("clears an added diff when the class disappears again", () => {
      const original = createWeek([]);
      const added = createWeek([createClass({ id: "new-class" })]);
      const diffs: SessionClassDiffsByWeek = new Map();

      recordSessionClassDiffs(original, added, diffs);
      const recorded = recordSessionClassDiffs(added, original, diffs);

      assert.deepEqual(recorded, []);
      assert.equal(diffs.size, 0);
      assert.deepEqual(applySessionClassDiffs(original, diffs).classes, []);
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
      assert.equal(diffs.get("2026-06-15")?.size, 1);
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
      const revertedClass = display.classes[0];
      assert.ok(revertedClass);
      assert.equal(revertedClass.id, "old-id");
      assert.equal(revertedClass.status, "scheduled");
   });

   void it("does not guess when multiple vanished classes are equally plausible", () => {
      const first = createClass({ id: "first", title: "Math", subject: "Math", teacher: "Teacher" });
      const second = createClass({ id: "second", title: "Math", subject: "Math", teacher: "Teacher" });
      const replacement = createClass({ id: "replacement", title: "Math", subject: "Math", teacher: "Teacher" });
      const diffs: SessionClassDiffsByWeek = new Map();

      const recorded = recordSessionClassDiffs(createWeek([first, second]), createWeek([replacement]), diffs);
      assert.equal(
         recorded.some((diff) => diff.schoolClass.id === "replacement" && diff.status === "changed"),
         false
      );
      assert.equal(
         recorded.some((diff) => diff.schoolClass.id === "replacement" && diff.status === "added"),
         true
      );
   });
});

function createWeek(classes: Class[]): Week {
   return {
      week: {
         offset: 0,
         number: 25,
         start: "2026-06-15",
         end: "2026-06-21",
      },
      classes,
   };
}

function createClass(overrides: Partial<Class> = {}): Class {
   const item = {
      id: "schoolClass",
      title: "Programming",
      subject: "TypeScript",
      start: "2026-06-16T09:00:00",
      end: "2026-06-16T10:30:00",
      teacher: "Teacher",
      room: "A101",
      location: "Main building",
      description: "Class",
      status: "scheduled" as const,
      ...overrides,
   };
   const { previous, ...details } = item;
   if (details.status === "changed") return { ...details, status: details.status, previous: previous ?? { ...details, status: "scheduled" } };
   if (details.status === "cancelled") return { ...details, status: "cancelled", ...(previous ? { previous } : {}) };
   return { ...details, status: details.status };
}
