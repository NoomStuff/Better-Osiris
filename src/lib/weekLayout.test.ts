import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { getMinutesFromMidnight, toDayKey } from "./date.js";
import { setRosterTimeZone } from "./rosterTimeZone.js";
import { DEFAULT_SHOWN_WEEKDAYS, getDays, getHiddenDaysWithClasses, getPositionedClasses, getVisibleDays } from "./weekLayout.js";
import type { Class } from "../types/weeks";

function createClass(overrides: Partial<Class> = {}): Class {
   return {
      id: "class-1",
      title: "Web Development",
      subject: "Programming",
      start: "2026-06-16T09:00:00",
      end: "2026-06-16T10:30:00",
      teacher: "J. Janssen",
      room: "A101",
      location: "Main building",
      description: "",
      status: "scheduled",
      ...overrides,
   };
}

void describe("roster layout", () => {
   afterEach(() => {
      setRosterTimeZone("Europe/Amsterdam");
   });

   void it("positions valid classes with parsed dates and day keys", () => {
      const positioned = getPositionedClasses([createClass()]);
      const first = positioned.at(0);
      assert.ok(first);

      assert.equal(positioned.length, 1);
      assert.equal(first.dayKey, "2026-06-16");
      // Wall-clock time must be read in the Amsterdam schedule timezone, not the machine timezone.
      assert.equal(getMinutesFromMidnight(first.startDate), 9 * 60);
      assert.equal(toDayKey(first.endDate), "2026-06-16");
      assert.equal(first.overlapCount, 1);
      assert.equal(first.overlapIndex, 0);
   });

   void it("drops classes with an end before or equal to their start", () => {
      const positioned = getPositionedClasses([
         createClass({ id: "reversed", start: "2026-06-16T10:30:00", end: "2026-06-16T09:00:00" }),
         createClass({ id: "zero-length", start: "2026-06-16T09:00:00", end: "2026-06-16T09:00:00" }),
      ]);

      assert.deepEqual(
         positioned.map((schoolClass) => schoolClass.id),
         []
      );
   });

   void it("places overlapping classes side by side in columns", () => {
      const positioned = getPositionedClasses([
         createClass({ id: "first", start: "2026-06-16T09:00:00", end: "2026-06-16T10:30:00" }),
         createClass({ id: "second", start: "2026-06-16T09:30:00", end: "2026-06-16T11:00:00" }),
      ]);

      assert.equal(positioned.find((schoolClass) => schoolClass.id === "first")?.overlapIndex, 0);
      assert.equal(positioned.find((schoolClass) => schoolClass.id === "second")?.overlapIndex, 1);
      assert.deepEqual(
         positioned.map((schoolClass) => schoolClass.overlapCount),
         [2, 2]
      );
   });

   void it("keeps sequential classes out of overlap clusters", () => {
      const positioned = getPositionedClasses([
         createClass({ id: "first", start: "2026-06-16T09:00:00", end: "2026-06-16T10:00:00" }),
         createClass({ id: "second", start: "2026-06-16T10:00:00", end: "2026-06-16T11:00:00" }),
      ]);

      assert.deepEqual(
         positioned.map((schoolClass) => schoolClass.overlapCount),
         [1, 1]
      );
   });

   void it("closes a cluster once no schoolClass overlaps the running columns", () => {
      const positioned = getPositionedClasses([
         createClass({ id: "a", start: "2026-06-16T09:00:00", end: "2026-06-16T10:00:00" }),
         createClass({ id: "b", start: "2026-06-16T09:30:00", end: "2026-06-16T10:30:00" }),
         createClass({ id: "c", start: "2026-06-16T10:00:00", end: "2026-06-16T11:00:00" }),
         createClass({ id: "d", start: "2026-06-16T11:00:00", end: "2026-06-16T12:00:00" }),
      ]);

      // a, b and c form one cluster (b still runs when c starts); d starts after the cluster ends.
      assert.deepEqual(
         positioned.map((schoolClass) => [schoolClass.id, schoolClass.overlapIndex, schoolClass.overlapCount]),
         [
            ["a", 0, 2],
            ["b", 1, 2],
            ["c", 0, 2],
            ["d", 0, 1],
         ]
      );
   });

   void it("keeps classes from different days in separate clusters", () => {
      const positioned = getPositionedClasses([
         createClass({ id: "tuesday", start: "2026-06-16T09:00:00", end: "2026-06-16T10:30:00" }),
         createClass({ id: "wednesday", start: "2026-06-17T09:30:00", end: "2026-06-17T11:00:00" }),
      ]);

      assert.deepEqual(
         positioned.map((schoolClass) => schoolClass.overlapCount),
         [1, 1]
      );
   });

   void it("groups positioned classes into all seven weekday groups", () => {
      const week = { offset: 0, number: 25, start: "2026-06-15", end: "2026-06-21" };
      const positioned = getPositionedClasses([
         createClass({ id: "late", start: "2026-06-16T13:00:00", end: "2026-06-16T14:00:00" }),
         createClass({ id: "early", start: "2026-06-16T09:00:00", end: "2026-06-16T10:30:00" }),
         createClass({ id: "weekend", start: "2026-06-20T09:00:00", end: "2026-06-20T10:00:00" }),
      ]);

      const groups = getDays(week, positioned);

      assert.equal(groups.length, 7);
      assert.deepEqual(
         groups.map((group) => group.key),
         ["2026-06-15", "2026-06-16", "2026-06-17", "2026-06-18", "2026-06-19", "2026-06-20", "2026-06-21"]
      );
      const tuesday = groups.at(1);
      assert.ok(tuesday);
      assert.deepEqual(
         tuesday.classes.map((schoolClass) => schoolClass.id),
         ["early", "late"]
      );
      const wednesday = groups.at(2);
      assert.ok(wednesday);
      assert.equal(wednesday.classes.length, 0);
      const saturday = groups.at(5);
      assert.ok(saturday);
      assert.deepEqual(
         saturday.classes.map((schoolClass) => schoolClass.id),
         ["weekend"]
      );
   });

   void it("hides weekend days by default but can show any weekday", () => {
      const week = { offset: 0, number: 25, start: "2026-06-15", end: "2026-06-21" };
      const positioned = getPositionedClasses([
         createClass({ id: "friday", start: "2026-06-19T09:00:00", end: "2026-06-19T10:00:00" }),
         createClass({ id: "saturday", start: "2026-06-20T09:00:00", end: "2026-06-20T10:00:00" }),
         createClass({ id: "sunday", start: "2026-06-21T09:00:00", end: "2026-06-21T10:00:00" }),
      ]);
      const groups = getDays(week, positioned);

      assert.deepEqual(
         getVisibleDays(groups, DEFAULT_SHOWN_WEEKDAYS).map((group) => group.key),
         ["2026-06-15", "2026-06-16", "2026-06-17", "2026-06-18", "2026-06-19"]
      );
      assert.deepEqual(
         getVisibleDays(groups, [1, 2, 3, 4, 5, 6, 7]).map((group) => group.key),
         ["2026-06-15", "2026-06-16", "2026-06-17", "2026-06-18", "2026-06-19", "2026-06-20", "2026-06-21"]
      );
      assert.deepEqual(
         getVisibleDays(groups, [6]).map((group) => group.key),
         ["2026-06-20"]
      );
   });

   void it("flags hidden days that still hold classes", () => {
      const week = { offset: 0, number: 25, start: "2026-06-15", end: "2026-06-21" };
      const positioned = getPositionedClasses([
         createClass({ id: "friday", start: "2026-06-19T09:00:00", end: "2026-06-19T10:00:00" }),
         createClass({ id: "saturday", start: "2026-06-20T09:00:00", end: "2026-06-20T10:00:00" }),
         createClass({ id: "sunday", start: "2026-06-21T09:00:00", end: "2026-06-21T10:00:00" }),
      ]);
      const groups = getDays(week, positioned);

      assert.deepEqual(
         getHiddenDaysWithClasses(groups, DEFAULT_SHOWN_WEEKDAYS).map((group) => group.key),
         ["2026-06-20", "2026-06-21"]
      );
      assert.deepEqual(getHiddenDaysWithClasses(groups, [1, 2, 3, 4, 5, 6, 7]), []);
      assert.deepEqual(
         getHiddenDaysWithClasses(groups, [6]).map((group) => group.key),
         ["2026-06-19", "2026-06-21"]
      );
      // Hidden days without classes never count.
      const emptyWeekend = getDays(week, getPositionedClasses([createClass({ id: "friday", start: "2026-06-19T09:00:00", end: "2026-06-19T10:00:00" })]));
      assert.deepEqual(getHiddenDaysWithClasses(emptyWeekend, DEFAULT_SHOWN_WEEKDAYS), []);
   });

   void it("sorts classes within a day chronologically", () => {
      const week = { offset: 0, number: 25, start: "2026-06-15", end: "2026-06-21" };
      const positioned = getPositionedClasses([
         createClass({ id: "later", start: "2026-06-16T14:00:00", end: "2026-06-16T15:00:00" }),
         createClass({ id: "earlier", start: "2026-06-16T09:00:00", end: "2026-06-16T10:00:00" }),
      ]);

      const groups = getDays(week, positioned);
      const tuesday = groups.at(1);
      assert.ok(tuesday);
      assert.deepEqual(
         tuesday.classes.map((schoolClass) => schoolClass.id),
         ["earlier", "later"]
      );
   });
});
