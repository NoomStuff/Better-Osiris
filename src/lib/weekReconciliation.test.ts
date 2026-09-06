import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Week } from "../types/weeks";
import { reconcileWeeks } from "./classDiffs";
import type { SessionClassDiffsByWeek } from "./classDiffs";

void describe("roster payload display state", () => {
   void it("reconciles stable IDs moved between batches without a removal placeholder", () => {
      const old = createWeek("2026-06-15", "same-id");
      const next = createWeek("2026-06-22", "same-id");
      const previous = new Map([[old.week.start, old]]);
      const result = reconcileWeeks(previous, [next], new Map());
      assert.equal(result.weeks.find((week) => week.week.start === old.week.start)?.classes.length, 0);
      assert.equal(result.weeks.find((week) => week.week.start === next.week.start)?.classes[0]?.status, "changed");
      assert.deepEqual(
         result.notifications.map((diff) => diff.status),
         ["changed"]
      );
      assert.equal(previous.get(old.week.start)?.classes.length, 1, "reconciliation must not mutate its input");
   });

   void it("does not turn a calendar rollover into cancelled classes", () => {
      const previousWeek = createWeek("2026-06-15", "old");
      const currentWeek = createWeek("2026-06-22", "new");
      const sessionDiffs: SessionClassDiffsByWeek = new Map();
      const result = reconcileWeeks(new Map([[previousWeek.week.start, previousWeek]]), [currentWeek], sessionDiffs);
      const displayed = result.weeks.filter((week) => week.week.start === currentWeek.week.start);

      assert.deepEqual(
         displayed[0]?.classes.map((schoolClass) => [schoolClass.id, schoolClass.status]),
         [["new", "scheduled"]]
      );
      assert.equal(result.changes.size, 0);
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
