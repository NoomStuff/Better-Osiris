import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseRosterConfig, parseWeek, parseWeekBatch } from "./rosterValidation.js";

const validRoster = {
   week: { offset: 0, number: 29, start: "2026-07-13", end: "2026-07-17" },
   classes: [
      {
         id: "schoolClass-1",
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
      assert.deepEqual(parseWeek(validRoster), validRoster);
   });

   void it("rejects impossible dates and out-of-range times", () => {
      assert.throws(() => parseWeek({ ...validRoster, week: { ...validRoster.week, start: "2026-02-30" } }), /valid ISO date/);
      assert.throws(
         () =>
            parseWeek({
               ...validRoster,
               classes: [{ ...validRoster.classes[0], start: "2026-07-15T25:00:00" }],
            }),
         /valid local ISO date-time/
      );
      assert.throws(
         () =>
            parseWeek({
               ...validRoster,
               classes: [{ ...validRoster.classes[0], end: "2026-07-15T08:59:00" }],
            }),
         /end after its start/
      );
   });
});

void describe("roster batch validation", () => {
   const validBatch = {
      offset: 0,
      limit: 1,
      timeZone: "Europe/Amsterdam",
      weeks: [validRoster],
   };

   void it("accepts a batch that declares its time zone", () => {
      assert.deepEqual(parseWeekBatch(validBatch), validBatch);
   });

   void it("rejects a batch without a declared time zone", () => {
      assert.throws(() => parseWeekBatch({ ...validBatch, timeZone: undefined }), /timeZone/);
      assert.throws(() => parseWeekBatch({ ...validBatch, timeZone: null }), /timeZone/);
   });

   void it("rejects a batch with an unknown time zone", () => {
      assert.throws(() => parseWeekBatch({ ...validBatch, timeZone: "Mars/Olympus_Mons" }), /valid IANA time zone/);
   });

   void it("validates the roster config time zone", () => {
      assert.deepEqual(parseRosterConfig({ timeZone: "Asia/Tokyo" }), { timeZone: "Asia/Tokyo" });
      assert.throws(() => parseRosterConfig({}), /timeZone/);
      assert.throws(() => parseRosterConfig({ timeZone: "Not/AZone" }), /valid IANA time zone/);
   });
});
