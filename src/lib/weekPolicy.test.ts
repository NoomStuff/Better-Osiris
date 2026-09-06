import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isoWeekNumber, shiftCalendarDate } from "../../shared/calendar";
import type { Class, Week } from "../types/weeks";
import { setRosterTimeZone } from "./rosterTimeZone";
import {
   canNavigateToWeek,
   createWeekEntry,
   getHomeWeek,
   getAdjacentWeekOffset,
   getAdjacentBatchStarts,
   getBatchOffsets,
   getBatchStart,
   type WeekEntries,
} from "./weekPolicy";

setRosterTimeZone("Europe/Amsterdam");
void describe("roster week batch policy", () => {
   void it("maps future weeks into stable five-week batches", () => {
      assert.equal(getBatchStart(0), 0);
      assert.equal(getBatchStart(4), 0);
      assert.equal(getBatchStart(5), 5);
      assert.deepEqual(getBatchOffsets(5), [5, 6, 7, 8, 9]);
   });
   void it("keeps the locally cached previous week in its own batch", () => {
      assert.equal(getBatchStart(-1), -1);
      assert.deepEqual(getBatchOffsets(-1), [-1]);
      assert.deepEqual(getAdjacentBatchStarts(-1), [0]);
   });
   void it("clamps the final batch to the navigation limit", () => {
      assert.deepEqual(getBatchOffsets(50), [50]);
   });
});
function week(offset: number, classes: Class[] = []): Week {
   const start = shiftCalendarDate("2026-06-15", offset * 7);
   return { week: { offset, start, end: shiftCalendarDate(start, 6), number: isoWeekNumber(start) }, classes };
}
function lesson(date: string, status: "scheduled" | "cancelled" = "scheduled"): Class {
   return {
      id: date,
      title: "Test",
      subject: "",
      teacher: "",
      room: "",
      location: "",
      description: "",
      start: `${date}T09:00:00`,
      end: `${date}T10:00:00`,
      status,
   };
}
void describe("upcoming week selection", () => {
   void it("keeps an ongoing class and advances when its week has no remaining classes", () => {
      const entries = { 0: createWeekEntry(week(0, [lesson("2026-06-16")])), 1: createWeekEntry(week(1, [lesson("2026-06-23")])) };
      assert.equal(getHomeWeek(entries, 0, new Date("2026-06-16T09:30:00+02:00")).offset, 0);
      assert.equal(getHomeWeek(entries, 0, new Date("2026-06-16T10:00:00+02:00")).offset, 1);
      assert.equal(getHomeWeek(entries, 0, new Date("2026-06-21T12:00:00+02:00")).offset, 1);
   });
   void it("includes weekend classes and excludes cancelled classes", () => {
      const saturday = lesson("2026-06-20");
      const entries = { 0: createWeekEntry(week(0, [saturday])), 1: createWeekEntry(week(1, [lesson("2026-06-23")])) };
      assert.equal(getHomeWeek(entries, 0, new Date("2026-06-20T08:00:00+02:00")).offset, 0);
      entries[0] = createWeekEntry(
         week(0, [{ ...saturday, status: "cancelled", previous: { ...saturday, status: "scheduled" } }, lesson("2026-06-21", "cancelled")])
      );
      assert.equal(getHomeWeek(entries, 0, new Date("2026-06-20T08:00:00+02:00")).offset, 1);
   });
   void it("checks unknown earlier weeks before selecting a later cached one", () => {
      const entries = { 1: createWeekEntry(week(1, [lesson("2026-06-23")])) };
      const now = new Date("2026-06-16T09:30:00+02:00");
      assert.deepEqual(getHomeWeek(entries, null, now), { offset: null, pendingOffset: 0 });
      assert.deepEqual(getHomeWeek(entries, 1, now), { offset: 1, pendingOffset: null });
   });
   void it("does not jump over a vacation and uses the source week when this week is omitted", () => {
      const entries: WeekEntries = Object.fromEntries(Array.from({ length: 51 }, (_, offset) => [offset, createWeekEntry(week(offset))]));
      entries[7] = createWeekEntry(week(7, [lesson("2026-08-04")]));
      assert.deepEqual(getHomeWeek(entries, 0, new Date("2026-06-16T09:30:00+02:00")), { offset: 0, pendingOffset: null });
      assert.deepEqual(getHomeWeek(entries, 1, new Date("2026-06-16T09:30:00+02:00")), { offset: 1, pendingOffset: null });
   });
   void it("keeps cached past weeks reachable while excluding unavailable dates", () => {
      const entries = { [-1]: createWeekEntry(week(-1)), 1: createWeekEntry(week(1)) };
      assert.equal(canNavigateToWeek(0, entries, 1), false);
      assert.equal(canNavigateToWeek(-1, entries, 1), true);
      assert.equal(getAdjacentWeekOffset(1, -1, entries, 1), -1);
      assert.equal(getAdjacentWeekOffset(1, -1, { 1: entries[1] }, 1), null);
   });
});
