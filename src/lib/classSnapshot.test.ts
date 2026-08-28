import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isSameClassDetails, toClassSnapshot } from "./classSnapshot.js";
import type { Class } from "../types/weeks";

function createClass(overrides: Partial<Class> = {}): Class {
   return {
      id: "class-1",
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

void describe("schoolClass snapshots", () => {
   void it("captures every visible schoolClass field", () => {
      const schoolClass = createClass();

      assert.deepEqual(toClassSnapshot(schoolClass), {
         id: schoolClass.id,
         title: schoolClass.title,
         subject: schoolClass.subject,
         start: schoolClass.start,
         end: schoolClass.end,
         teacher: schoolClass.teacher,
         room: schoolClass.room,
         location: schoolClass.location,
         description: schoolClass.description,
         status: schoolClass.status,
      });
   });

   void it("treats classes with identical details as the same", () => {
      assert.equal(isSameClassDetails(createClass(), createClass()), true);
   });

   void it("ignores id and status when comparing details", () => {
      assert.equal(isSameClassDetails(createClass(), createClass({ id: "other", status: "cancelled" })), true);
   });

   void it("detects a changed visible field", () => {
      assert.equal(isSameClassDetails(createClass(), createClass({ room: "B202" })), false);
      assert.equal(isSameClassDetails(createClass(), createClass({ start: "2026-06-16T10:00:00" })), false);
   });
});
