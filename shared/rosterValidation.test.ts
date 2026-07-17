import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseRosterResponse } from "./rosterValidation.js";

const validRoster = {
   week: { offset: 0, number: 29, start: "2026-07-13", end: "2026-07-17" },
   lessons: [
      {
         id: "lesson-1",
         title: "Testing",
         subject: "Runtime validation",
         start: "2026-07-15T09:00:00",
         end: "2026-07-15T10:00:00",
         teacher: "Teacher",
         room: "A1",
         location: "Campus",
         description: "Description",
         status: "scheduled",
      },
   ],
};

void describe("roster response validation", () => {
   void it("accepts valid normalized roster dates", () => {
      assert.deepEqual(parseRosterResponse(validRoster), validRoster);
   });

   void it("rejects impossible dates and out-of-range times", () => {
      assert.throws(() => parseRosterResponse({ ...validRoster, week: { ...validRoster.week, start: "2026-02-30" } }), /valid ISO date/);
      assert.throws(
         () =>
            parseRosterResponse({
               ...validRoster,
               lessons: [{ ...validRoster.lessons[0], start: "2026-07-15T25:00:00" }],
            }),
         /valid local ISO date-time/
      );
      assert.throws(
         () =>
            parseRosterResponse({
               ...validRoster,
               lessons: [{ ...validRoster.lessons[0], end: "2026-07-15T08:59:00" }],
            }),
         /end after its start/
      );
   });
});
