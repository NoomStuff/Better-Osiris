import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { getLocalWeekStartIso, getMinutesFromMidnight, getRosterWeekBounds, parseLocalDateTime, timeLabel, toDayKey } from "./date";
import { setRosterTimeZone } from "./rosterTimeZone";

afterEach(() => {
   setRosterTimeZone("Europe/Amsterdam");
});

void describe("roster date handling", () => {
   void it("interprets timezone-less winter and summer times as roster wall time", () => {
      setRosterTimeZone("Europe/Amsterdam");
      assert.equal(parseLocalDateTime("2026-01-15T09:00:00").toISOString(), "2026-01-15T08:00:00.000Z");
      assert.equal(parseLocalDateTime("2026-07-15T09:00:00").toISOString(), "2026-07-15T07:00:00.000Z");
   });

   void it("uses the declared roster time zone instead of the device zone", () => {
      setRosterTimeZone("Asia/Tokyo");
      assert.equal(parseLocalDateTime("2026-01-15T09:00:00").toISOString(), "2026-01-15T00:00:00.000Z");
   });

   void it("formats and positions roster times in the roster time zone", () => {
      setRosterTimeZone("Europe/Amsterdam");
      const date = new Date("2026-07-15T07:30:00.000Z");
      assert.equal(timeLabel.format(date), "09:30");
      assert.equal(getMinutesFromMidnight(date), 9 * 60 + 30);
      assert.equal(toDayKey(date), "2026-07-15");
   });

   void it("puts a moment near midnight on the calendar day the roster zone says it is", () => {
      setRosterTimeZone("Asia/Tokyo");
      assert.equal(toDayKey(new Date("2026-07-15T15:30:00.000Z")), "2026-07-16");
   });

   void it("keeps Saturday and Sunday in their actual calendar week", () => {
      setRosterTimeZone("Europe/Amsterdam");
      assert.equal(getLocalWeekStartIso(new Date("2026-07-19T12:00:00.000Z")), "2026-07-13");
   });

   void it("derives week bounds from the roster week start", () => {
      setRosterTimeZone("Europe/Amsterdam");
      const bounds = getRosterWeekBounds(new Date("2026-07-15T12:00:00.000Z"), 2);
      assert.deepEqual(bounds, { start: "2026-07-27", end: "2026-08-02" });
   });
});
