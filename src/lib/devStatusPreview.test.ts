import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applyDevClassStatusPreview } from "./devStatusPreview.js";
import type { Class, Week } from "../types/weeks";

void describe("dev roster status preview", () => {
   void it("leaves roster data untouched when disabled", () => {
      const week = createWeek();

      assert.equal(applyDevClassStatusPreview(week, "none"), week);
   });

   void it("can preview added, changed, cancelled, and mixed status states", () => {
      const week = createWeek();

      assert.deepEqual(
         applyDevClassStatusPreview(week, "added")?.classes.map((schoolClass) => schoolClass.status),
         ["added", "scheduled", "scheduled"]
      );
      assert.deepEqual(
         applyDevClassStatusPreview(week, "changed")?.classes.map((schoolClass) => schoolClass.status),
         ["changed", "scheduled", "scheduled"]
      );
      assert.deepEqual(
         applyDevClassStatusPreview(week, "cancelled")?.classes.map((schoolClass) => schoolClass.status),
         ["cancelled", "scheduled", "scheduled"]
      );
      assert.deepEqual(
         applyDevClassStatusPreview(week, "mixed")?.classes.map((schoolClass) => schoolClass.status),
         ["changed", "cancelled", "scheduled"]
      );
      assert.equal(applyDevClassStatusPreview(week, "added")?.classes[0]?.previous, undefined);
      assert.equal(applyDevClassStatusPreview(week, "changed")?.classes[0]?.previous?.room, "B12");
   });
});

function createWeek(): Week {
   return {
      week: {
         offset: 0,
         number: 25,
         start: "2026-06-15",
         end: "2026-06-19",
      },
      classes: [createClass("one"), createClass("two"), createClass("three")],
   };
}

function createClass(id: string): Class {
   return {
      id,
      title: "Programming",
      subject: "TypeScript",
      start: "2026-06-16T09:00:00",
      end: "2026-06-16T10:30:00",
      teacher: "Teacher",
      room: "A101",
      location: "Main building",
      description: "Class",
      status: "scheduled",
   };
}
