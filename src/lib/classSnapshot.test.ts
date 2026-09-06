import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isSameClassDetails, toClassSnapshot } from "./classSnapshot.js";
import type { ClassSnapshot } from "../types/weeks";

const schoolClass: ClassSnapshot = {
   id: "class-1",
   title: "Web Development",
   subject: "Programming",
   start: "2026-06-16T09:00:00",
   end: "2026-06-16T10:30:00",
   teacher: "J. Janssen",
   room: "A101",
   location: "Main building",
   description: "",
   status: "scheduled" as const,
};

void describe("schoolClass snapshots", () => {
   void it("keeps class details and cancellation but drops session change history", () => {
      assert.deepEqual(toClassSnapshot({ ...schoolClass, status: "changed", previous: schoolClass }), schoolClass);
      const cancelled = { ...schoolClass, status: "cancelled" as const };
      assert.deepEqual(toClassSnapshot(cancelled), cancelled);
   });

   void it("ignores id and status when comparing details", () => {
      const other: ClassSnapshot = { ...schoolClass, id: "other", status: "cancelled" };
      assert.equal(isSameClassDetails(schoolClass, other), true);
   });

   void it("detects a changed visible field", () => {
      assert.equal(isSameClassDetails(schoolClass, { ...schoolClass, room: "B202" }), false);
      assert.equal(isSameClassDetails(schoolClass, { ...schoolClass, start: "2026-06-16T10:00:00" }), false);
   });
});
