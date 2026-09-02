import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getRequiredGridHours, getSmartGridHours, normalizeGridHourRange } from "./gridHours.js";
import type { Day, PositionedClass, Week } from "../types/weeks.js";

function schoolClass(id: string, start: string, end: string) {
   return {
      id,
      title: id,
      subject: id,
      start,
      end,
      teacher: "Teacher",
      room: "Room",
      location: "Campus",
      description: "",
      status: "scheduled" as const,
   };
}

void describe("grid hour ranges", () => {
   void it("rounds lesson bounds outward to whole hours", () => {
      const weeks: Week[] = [
         {
            week: { offset: 0, number: 25, start: "2026-06-15", end: "2026-06-21" },
            classes: [schoolClass("early", "2026-06-16T08:30:00", "2026-06-16T10:00:00"), schoolClass("late", "2026-06-16T17:00:00", "2026-06-16T18:01:00")],
         },
      ];

      assert.deepEqual(getSmartGridHours(weeks), [8, 19]);
   });

   void it("only derives the required range from currently visible days", () => {
      const positioned = {
         ...schoolClass("visible", "2026-06-16T09:15:00", "2026-06-16T12:10:00"),
         startDate: new Date("2026-06-16T09:15:00"),
         endDate: new Date("2026-06-16T12:10:00"),
         dayKey: "2026-06-16",
         overlapIndex: 0,
         overlapCount: 1,
      } satisfies PositionedClass;
      const days: Day[] = [{ key: "2026-06-16", date: new Date("2026-06-16"), classes: [positioned] }];

      assert.deepEqual(getRequiredGridHours(days), [9, 13]);
   });

   void it("always normalizes to a usable one-hour minimum range", () => {
      assert.deepEqual(normalizeGridHourRange(24, 24), [23, 24]);
      assert.deepEqual(normalizeGridHourRange(0, 0), [0, 1]);
   });
});
