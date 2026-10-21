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
   getBatchOffsets,
   getBatchStart,
   isSameWeekData,
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
   void it("settles on an empty current week when the next week is omitted", () => {
      const entries = { 0: createWeekEntry(week(0)), 1: createWeekEntry(null, { isOmitted: true }) };
      assert.deepEqual(getHomeWeek(entries, 0, new Date("2026-06-16T09:30:00+02:00")), { offset: 0, pendingOffset: null });
   });
   void it("updates displayed change history even when current details are identical", () => {
      const current = { ...lesson("2026-06-16"), status: "scheduled" as const };
      const left = week(0, [{ ...current, status: "changed", previous: { ...current, room: "A" } }]);
      const right = week(0, [{ ...current, status: "changed", previous: { ...current, room: "B" } }]);
      assert.equal(isSameWeekData(left, right), false);
      assert.equal(isSameWeekData(left, structuredClone(left)), true);
   });
   void it("keeps today through the end of Friday and rolls hidden weekends forward", () => {
      const entries = { 0: createWeekEntry(week(0, [lesson("2026-06-16")])), 1: createWeekEntry(week(1)) };
      for (const time of ["2026-06-16T10:00:00+02:00", "2026-06-19T23:59:59+02:00"]) {
         assert.equal(getHomeWeek(entries, 0, new Date(time)).offset, 0);
      }
      for (const day of [20, 21]) {
         const now = new Date(`2026-06-${day}T12:00:00+02:00`);
         assert.equal(getHomeWeek(entries, 0, now).offset, 1);
         assert.equal(getHomeWeek(entries, 0, now, [1, 2, 3, 4, 5, 6, 7]).offset, 0);
      }
   });
   void it("uses visible days even when they have no classes and keeps hidden classes hidden", () => {
      const entries = { 0: createWeekEntry(week(0, [lesson("2026-06-20", "cancelled")])), 1: createWeekEntry(week(1)) };
      assert.equal(getHomeWeek(entries, 0, new Date("2026-06-17T12:00:00+02:00"), [4]).offset, 0);
      assert.equal(getHomeWeek(entries, 0, new Date("2026-06-20T08:00:00+02:00")).offset, 1);
      assert.equal(getHomeWeek(entries, 0, new Date("2026-06-20T08:00:00+02:00"), [6]).offset, 0);
      assert.equal(getHomeWeek(entries, 0, new Date("2026-06-21T08:00:00+02:00"), [6]).offset, 1);
   });
   void it("follows visibility through an empty vacation week", () => {
      const entries = { 0: createWeekEntry(week(0)), 1: createWeekEntry(week(1, [lesson("2026-06-23")])) };
      assert.equal(getHomeWeek(entries, 0, new Date("2026-06-21T23:59:59+02:00")).offset, 1);
   });
   void it("waits for the target week without requiring classes", () => {
      const entries = { 0: createWeekEntry(week(0, [lesson("2026-06-16")])) };
      assert.deepEqual(getHomeWeek(entries, 0, new Date("2026-06-20T12:00:00+02:00")), { offset: null, pendingOffset: 1 });
   });
   void it("uses the roster date across midnight, year boundaries and daylight saving", () => {
      const entries = { 0: createWeekEntry(week(0, [lesson("2026-06-16")])), 1: createWeekEntry(week(1)) };
      assert.equal(getHomeWeek(entries, 0, new Date("2026-06-19T22:00:00Z")).offset, 1);
      assert.equal(getHomeWeek(entries, 0, new Date("2027-01-03T23:00:00Z"), [1]).offset, 0);
      assert.equal(getHomeWeek(entries, 0, new Date("2026-10-25T01:30:00Z")).offset, 1);
      assert.equal(getHomeWeek(entries, 0, new Date("2026-03-29T01:30:00Z"), [7]).offset, 0);
   });
   void it("checks unknown earlier weeks before selecting a later cached one", () => {
      const entries = { 1: createWeekEntry(week(1, [lesson("2026-06-23")])) };
      const now = new Date("2026-06-16T09:30:00+02:00");
      assert.deepEqual(getHomeWeek(entries, null, now), { offset: null, pendingOffset: 0 });
      assert.deepEqual(getHomeWeek(entries, 1, now), { offset: 1, pendingOffset: null });
   });
   void it("does not skip a cached vacation when the source advances", () => {
      const entries: WeekEntries = Object.fromEntries(Array.from({ length: 51 }, (_, offset) => [offset, createWeekEntry(week(offset))]));
      entries[7] = createWeekEntry(week(7, [lesson("2026-08-04")]));
      assert.deepEqual(getHomeWeek(entries, 0, new Date("2026-06-16T09:30:00+02:00")), { offset: 0, pendingOffset: null });
      assert.deepEqual(getHomeWeek(entries, 1, new Date("2026-06-16T09:30:00+02:00")), { offset: 0, pendingOffset: null });
   });
   void it("keeps cached past weeks reachable while excluding unavailable dates", () => {
      const entries = { [-1]: createWeekEntry(week(-1)), 1: createWeekEntry(week(1)) };
      assert.equal(canNavigateToWeek(0, entries, 1), false);
      assert.equal(canNavigateToWeek(-1, entries, 1), true);
      assert.equal(getAdjacentWeekOffset(1, -1, entries, 1), -1);
      assert.equal(getAdjacentWeekOffset(1, -1, { 1: entries[1] }, 1), null);
   });
});
