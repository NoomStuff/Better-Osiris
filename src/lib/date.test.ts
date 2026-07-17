import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getLocalWeekStartIso, getMinutesFromMidnight, parseLocalDateTime, timeLabel, toDayKey } from "./date";

void describe("Amsterdam roster date handling", () => {
   void it("interprets timezone-less winter and summer times as Amsterdam wall time", () => {
      assert.equal(parseLocalDateTime("2026-01-15T09:00:00").toISOString(), "2026-01-15T08:00:00.000Z");
      assert.equal(parseLocalDateTime("2026-07-15T09:00:00").toISOString(), "2026-07-15T07:00:00.000Z");
   });

   void it("formats and positions roster times in Amsterdam", () => {
      const date = new Date("2026-07-15T07:30:00.000Z");
      assert.equal(timeLabel.format(date), "09:30");
      assert.equal(getMinutesFromMidnight(date), 9 * 60 + 30);
      assert.equal(toDayKey(date), "2026-07-15");
   });

   void it("keeps Saturday and Sunday in their actual calendar week", () => {
      assert.equal(getLocalWeekStartIso(new Date("2026-07-19T12:00:00.000Z")), "2026-07-13");
   });
});
