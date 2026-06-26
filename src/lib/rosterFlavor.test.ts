import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getEmptyWeekMessage } from "./rosterFlavor.js";

function addWeeks(weekStart: string, weeks: number) {
   const date = new Date(`${weekStart}T12:00:00Z`);
   date.setUTCDate(date.getUTCDate() + weeks * 7);
   return date.toISOString().slice(0, 10);
}

function getEmptyWeekTitle(weekStart: string) {
   return getEmptyWeekMessage(weekStart).title;
}

void describe("getEmptyWeekMessage", () => {
   void it("is deterministic for a given week", () => {
      assert.deepEqual(getEmptyWeekMessage("2026-06-22"), getEmptyWeekMessage("2026-06-22"));
   });

   void it("does not repeat messages back to back", () => {
      const titles = Array.from({ length: 80 }, (_, index) => getEmptyWeekTitle(addWeeks("2026-01-05", index)));

      for (let index = 1; index < titles.length; index += 1) {
         assert.notEqual(titles[index], titles[index - 1]);
      }
   });

   void it("uses every message once per ten-week cycle", () => {
      const titles = Array.from({ length: 10 }, (_, index) => getEmptyWeekTitle(addWeeks("2026-01-05", index)));

      assert.equal(new Set(titles).size, 10);
   });
});
