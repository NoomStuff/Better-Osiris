import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { getDefaultExpandedDays } from "./useAgendaState.js";
import type { Day } from "../types/weeks.js";
import { setRosterTimeZone } from "../lib/rosterTimeZone.js";

const days = ["2026-06-15", "2026-06-16", "2026-06-17"].map((key) => ({ key, date: new Date(`${key}T12:00:00`), classes: [] })) satisfies Day[];

beforeEach(() => setRosterTimeZone("Europe/Amsterdam"));

void describe("agenda automatic folding", () => {
   void it("single only opens today in the current week", () => {
      assert.deepEqual([...getDefaultExpandedDays(days, 0, new Date("2026-06-16T12:00:00"), "single")], ["2026-06-16"]);
      assert.deepEqual([...getDefaultExpandedDays(days, 1, new Date("2026-06-16T12:00:00"), "single")], []);
   });

   void it("all opens every shown day", () => {
      assert.deepEqual(
         [...getDefaultExpandedDays(days, 0, new Date("2026-06-16T12:00:00"), "all")],
         days.map((day) => day.key)
      );
   });

   void it("smart opens today and future days with classes, but not past days", () => {
      const classPlaceholder = {} as Day["classes"][number];
      const [past, today, future] = days;
      assert.ok(past && today && future);
      const daysWithClasses: Day[] = [{ ...past, classes: [classPlaceholder] }, today, { ...future, classes: [classPlaceholder] }];

      assert.deepEqual([...getDefaultExpandedDays(daysWithClasses, 0, new Date("2026-06-16T12:00:00"), "smart")], ["2026-06-16", "2026-06-17"]);
   });
});
