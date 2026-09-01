import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Week, WeekBatch } from "../types/weeks";
import { getDisplayWeeksFromPayload } from "./weekPayload";
import { createWeekEntry, type WeekEntries } from "./weekPolicy";
import type { SessionClassDiffsByWeek } from "./classDiffs";

void describe("roster payload display state", () => {
   void it("does not turn a calendar rollover into cancelled classes", () => {
      const previousWeek = createWeek("2026-06-15", "old");
      const currentWeek = createWeek("2026-06-22", "new");
      const entries: WeekEntries = { 0: createWeekEntry(previousWeek) };
      const sessionDiffs: SessionClassDiffsByWeek = new Map();
      const payload: WeekBatch = {
         offset: 0,
         limit: 1,
         timeZone: "Europe/Amsterdam",
         weeks: [currentWeek],
      };

      const displayed = getDisplayWeeksFromPayload(payload, entries, new Map(), sessionDiffs);

      assert.deepEqual(
         displayed[0]?.classes.map((schoolClass) => [schoolClass.id, schoolClass.status]),
         [["new", "scheduled"]]
      );
      assert.equal(sessionDiffs.size, 0);
   });
});

function createWeek(start: string, classId: string): Week {
   const startDate = new Date(`${start}T00:00:00Z`);
   const tuesday = new Date(startDate);
   tuesday.setUTCDate(tuesday.getUTCDate() + 1);
   const endDate = new Date(startDate);
   endDate.setUTCDate(endDate.getUTCDate() + 6);
   const tuesdayKey = tuesday.toISOString().slice(0, 10);

   return {
      week: {
         offset: 0,
         number: 1,
         start,
         end: endDate.toISOString().slice(0, 10),
      },
      classes: [
         {
            id: classId,
            title: classId,
            subject: "Subject",
            start: `${tuesdayKey}T09:00:00`,
            end: `${tuesdayKey}T10:00:00`,
            teacher: "Teacher",
            room: "Room",
            location: "Location",
            description: "Description",
            status: "scheduled",
         },
      ],
   };
}
