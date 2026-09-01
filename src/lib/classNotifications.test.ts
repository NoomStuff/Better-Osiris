import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { getClassNotificationBodies } from "./classNotifications.js";
import { setRosterTimeZone } from "./rosterTimeZone.js";
import type { SessionClassDiff } from "./classDiffs.js";
import type { Class, ClassSnapshot } from "../types/weeks";

void describe("roster desktop notification messages", () => {
   beforeEach(() => {
      setRosterTimeZone("Europe/Amsterdam");
   });

   void it("describes a single cancellation with its day and start time", () => {
      const diff = createDiff("cancelled");

      assert.deepEqual(getClassNotificationBodies([diff]), ["Web Development was cancelled: Tuesday 10:30"]);
   });

   void it("uses the most useful changed field for a single changed schoolClass", () => {
      const diff = createDiff("changed", { room: "C04" }, { room: "B12" });

      assert.deepEqual(getClassNotificationBodies([diff]), ["Web Development changed: B12 → C04"]);
   });

   void it("describes a newly added schoolClass", () => {
      const schoolClass = createClass({ status: "added" });
      const diff = { schoolClass, status: "added" } satisfies SessionClassDiff;

      assert.deepEqual(getClassNotificationBodies([diff]), ["Web Development was added: Tuesday 10:30"]);
   });

   void it("groups multiple changes by status", () => {
      const diffs = [
         createDiff("cancelled"),
         createDiff("cancelled", { id: "cancelled-2" }),
         createDiff("cancelled", { id: "cancelled-3" }),
         createDiff("changed", { id: "changed-1", room: "C04" }, { id: "changed-1", room: "B12" }),
         createDiff("changed", { id: "changed-2", room: "D05" }, { id: "changed-2", room: "A01" }),
      ];

      assert.deepEqual(getClassNotificationBodies(diffs), ["3 classes were cancelled", "2 classes were changed"]);
   });
});

function createDiff(status: "changed" | "cancelled", classOverrides: Partial<Class> = {}, previousOverrides: Partial<ClassSnapshot> = {}) {
   const schoolClass = createClass(classOverrides);
   const previousClass: ClassSnapshot = {
      ...schoolClass,
      ...previousOverrides,
      status: "scheduled",
   };

   return {
      schoolClass: { ...schoolClass, status, previous: previousClass },
      previousClass,
      status,
   } satisfies SessionClassDiff;
}

function createClass(overrides: Partial<Class> = {}): Class {
   return {
      id: "schoolClass",
      title: "Web Development",
      subject: "TypeScript",
      start: "2026-06-16T10:30:00+02:00",
      end: "2026-06-16T12:00:00+02:00",
      teacher: "Teacher",
      room: "B12",
      location: "Main building",
      description: "Class",
      status: "scheduled",
      ...overrides,
   };
}
