import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { getDefaultExpandedDays, getNextClassDay } from "./useAgendaState.js";
import type { Day, Week } from "../types/weeks.js";
import { setRosterTimeZone } from "../lib/rosterTimeZone.js";

const days = ["2026-06-15", "2026-06-16", "2026-06-17"].map((key) => ({ key, date: new Date(`${key}T12:00:00`), classes: [] })) satisfies Day[];

beforeEach(() => setRosterTimeZone("Europe/Amsterdam"));

void describe("agenda automatic folding", () => {
   void it("single opens only the next class day regardless of home week", () => {
      assert.deepEqual([...getDefaultExpandedDays(days, new Date("2026-06-16T12:00:00"), "single", true, "2026-06-16")], ["2026-06-16"]);
      assert.deepEqual([...getDefaultExpandedDays(days, new Date("2026-06-23T12:00:00"), "single", false, "2026-06-23")], []);
   });

   void it("all opens every shown day", () => {
      assert.deepEqual(
         [...getDefaultExpandedDays(days, new Date("2026-06-16T12:00:00"), "all", true, null)],
         days.map((day) => day.key)
      );
   });

   void it("smart opens today and future days with classes, but not past days", () => {
      const classPlaceholder = {} as Day["classes"][number];
      const [past, today, future] = days;
      assert.ok(past && today && future);
      const daysWithClasses: Day[] = [{ ...past, classes: [classPlaceholder] }, today, { ...future, classes: [classPlaceholder] }];

      assert.deepEqual([...getDefaultExpandedDays(daysWithClasses, new Date("2026-06-16T12:00:00"), "smart", true, null)], ["2026-06-16", "2026-06-17"]);
   });
});

for (const mode of ["smart"] as const) {
   for (const now of ["2026-06-09T12:00:00+02:00", "2026-06-20T12:00:00+02:00", "2026-06-23T12:00:00+02:00"]) {
      void it(`${mode} opens nonempty days outside the home week at ${now}`, () => {
         const populatedDays = days.map((day, index) => ({ ...day, classes: index === 1 ? [] : [{} as Day["classes"][number]] }));
         assert.deepEqual([...getDefaultExpandedDays(populatedDays, new Date(now), mode, false, null)], ["2026-06-15", "2026-06-17"]);
      });
   }
}

void it("single opens the next class day in another week and closes everything when no next class is known", () => {
   assert.deepEqual([...getDefaultExpandedDays(days, new Date("2026-06-14T12:00:00+02:00"), "single", false, "2026-06-16")], ["2026-06-16"]);
   assert.deepEqual([...getDefaultExpandedDays(days, new Date("2026-06-14T12:00:00+02:00"), "single", true, null)], []);
});

void it("finds the earliest future noncancelled class across known weeks", () => {
   const weeks = [
      { classes: [{ start: "2026-06-23T10:00:00", status: "scheduled" }] },
      {
         classes: [
            { start: "2026-06-15T10:00:00", status: "scheduled" },
            { start: "2026-06-16T10:00:00", status: "cancelled" },
            { start: "2026-06-17T10:00:00", status: "changed" },
         ],
      },
   ] as Week[];
   assert.equal(getNextClassDay(weeks, new Date("2026-06-16T09:00:00+02:00")), "2026-06-17");
   assert.equal(getNextClassDay(weeks, new Date("2026-06-24T09:00:00+02:00")), null);
});
