import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { collectNextUpEntries, getLeadLabel, getNextUpDayLabel, getNextUpSuggestion } from "./nextUp.js";
import { setRosterTimeZone } from "./rosterTimeZone.js";
import type { Class, Week } from "../types/weeks.js";

beforeEach(() => setRosterTimeZone("Europe/Amsterdam"));

function makeClass(overrides: Partial<Class>): Class {
   return {
      id: "class-id",
      title: "Calculus",
      subject: "CALC-1",
      start: "2026-06-16T13:00:00",
      end: "2026-06-16T14:30:00",
      teacher: "Dr. Bloem",
      room: "HL15",
      location: "Utrecht",
      description: "",
      status: "scheduled",
      ...overrides,
   } as Class;
}

function makeWeek(classes: Class[]): Week {
   return { week: { offset: 0, number: 25, start: "2026-06-15", end: "2026-06-21" }, classes };
}

void describe("next up entries", () => {
   void it("collects and sorts valid classes", () => {
      const late = makeClass({ id: "late", start: "2026-06-16T15:00:00", end: "2026-06-16T16:00:00" });
      const early = makeClass({ id: "early", start: "2026-06-16T09:00:00", end: "2026-06-16T10:00:00" });
      const reversed = makeClass({ id: "reversed", start: "2026-06-16T12:00:00", end: "2026-06-16T11:00:00" });
      const entries = collectNextUpEntries([makeWeek([late, reversed, early])]);
      assert.deepEqual(
         entries.map((entry) => entry.schoolClass.id),
         ["early", "late"]
      );
   });
});

void describe("next up suggestion", () => {
   void it("picks the earliest upcoming active class across weeks and flags the cancellation before it", () => {
      const entries = collectNextUpEntries([
         makeWeek([makeClass({ id: "past", start: "2026-06-15T10:00:00", end: "2026-06-15T11:00:00" })]),
         makeWeek([
            makeClass({ id: "died", start: "2026-06-16T11:00:00", end: "2026-06-16T12:00:00", status: "cancelled" }),
            makeClass({ id: "target", start: "2026-06-16T13:00:00", end: "2026-06-16T14:30:00" }),
            makeClass({ id: "later", start: "2026-06-17T09:00:00", end: "2026-06-17T10:00:00" }),
         ]),
      ]);
      const suggestion = getNextUpSuggestion(entries, new Date("2026-06-16T09:00:00+02:00"));
      assert.ok(suggestion);
      assert.equal(suggestion.phase, "upcoming");
      assert.equal(suggestion.target.schoolClass.id, "target");
      assert.equal(suggestion.cancelled?.schoolClass.id, "died");
      assert.equal(suggestion.then, null);
   });

   void it("reports the running class with progress and the class that follows it", () => {
      const entries = collectNextUpEntries([
         makeWeek([
            makeClass({ id: "running", start: "2026-06-16T09:00:00", end: "2026-06-16T10:30:00" }),
            makeClass({ id: "following", start: "2026-06-16T11:00:00", end: "2026-06-16T12:00:00" }),
         ]),
      ]);
      const suggestion = getNextUpSuggestion(entries, new Date("2026-06-16T10:00:00+02:00"));
      assert.ok(suggestion);
      assert.equal(suggestion.phase, "now");
      assert.equal(suggestion.target.schoolClass.id, "running");
      assert.equal(suggestion.progress, 2 / 3);
      assert.equal(suggestion.then?.schoolClass.id, "following");
   });

   void it("flags a cancellation that would be running right now", () => {
      const entries = collectNextUpEntries([
         makeWeek([
            makeClass({ id: "died", start: "2026-06-16T09:00:00", end: "2026-06-16T10:30:00", status: "cancelled" }),
            makeClass({ id: "target", start: "2026-06-16T13:00:00", end: "2026-06-16T14:30:00" }),
         ]),
      ]);
      const suggestion = getNextUpSuggestion(entries, new Date("2026-06-16T10:00:00+02:00"));
      assert.ok(suggestion);
      assert.equal(suggestion.cancelled?.schoolClass.id, "died");
   });

   void it("ignores cancellations that ended before now", () => {
      const entries = collectNextUpEntries([
         makeWeek([
            makeClass({ id: "died", start: "2026-06-15T09:00:00", end: "2026-06-15T10:30:00", status: "cancelled" }),
            makeClass({ id: "target", start: "2026-06-16T13:00:00", end: "2026-06-16T14:30:00" }),
         ]),
      ]);
      const suggestion = getNextUpSuggestion(entries, new Date("2026-06-16T10:00:00+02:00"));
      assert.ok(suggestion);
      assert.equal(suggestion.cancelled, null);
   });

   void it("returns null when only past or cancelled classes remain", () => {
      const past = collectNextUpEntries([makeWeek([makeClass({ id: "past", start: "2026-06-15T10:00:00", end: "2026-06-15T11:00:00" })])]);
      assert.equal(getNextUpSuggestion(past, new Date("2026-06-16T10:00:00+02:00")), null);

      const cancelled = collectNextUpEntries([
         makeWeek([makeClass({ id: "died", start: "2026-06-16T11:00:00", end: "2026-06-16T12:00:00", status: "cancelled" })]),
      ]);
      assert.equal(getNextUpSuggestion(cancelled, new Date("2026-06-16T10:00:00+02:00")), null);
   });

   void it("switches to the next class ten minutes before the running one ends", () => {
      const entries = collectNextUpEntries([
         makeWeek([
            makeClass({ id: "running", start: "2026-06-16T09:00:00", end: "2026-06-16T10:30:00" }),
            makeClass({ id: "next", start: "2026-06-16T11:00:00", end: "2026-06-16T12:00:00" }),
         ]),
      ]);
      const stillRunning = getNextUpSuggestion(entries, new Date("2026-06-16T10:15:00+02:00"));
      assert.ok(stillRunning);
      assert.equal(stillRunning.phase, "now");
      assert.equal(stillRunning.target.schoolClass.id, "running");

      const movingOn = getNextUpSuggestion(entries, new Date("2026-06-16T10:23:00+02:00"));
      assert.ok(movingOn);
      assert.equal(movingOn.phase, "upcoming");
      assert.equal(movingOn.target.schoolClass.id, "next");
      assert.equal(movingOn.lead, "in 37 min");
   });

   void it("keeps showing the running class when nothing follows it", () => {
      const entries = collectNextUpEntries([makeWeek([makeClass({ id: "running", start: "2026-06-16T09:00:00", end: "2026-06-16T10:30:00" })])]);
      const suggestion = getNextUpSuggestion(entries, new Date("2026-06-16T10:25:00+02:00"));
      assert.ok(suggestion);
      assert.equal(suggestion.phase, "now");
      assert.equal(suggestion.target.schoolClass.id, "running");
      assert.equal(suggestion.lead, "5 min left");
   });
});

void describe("next up labels", () => {
   void it("leads with minutes, then hours, tomorrow, days and weeks", () => {
      const now = new Date("2026-06-16T09:00:00+02:00");
      assert.equal(getLeadLabel(30_000, now), "in 1 min");
      assert.equal(getLeadLabel(59 * 60_000, now), "in 59 min");
      assert.equal(getLeadLabel(60 * 60_000, now), "in 1 hr");
      assert.equal(getLeadLabel(65 * 60_000, now), "in 1 hr 5 min");
      assert.equal(getLeadLabel(3.4 * 3_600_000, now), "in 3 hr");
      assert.equal(getLeadLabel(11 * 3_600_000, now), "in 11 hr");
      // 13 hours ahead lands the same evening, so the clock keeps counting.
      assert.equal(getLeadLabel(13 * 3_600_000, now), "in 13 hr");
      // 12.75 hours ahead crosses midnight, so the calendar word takes over.
      assert.equal(getLeadLabel(12.75 * 3_600_000, new Date("2026-06-16T20:00:00+02:00")), "Tomorrow");
      assert.equal(getLeadLabel(30 * 3_600_000, now), "Tomorrow");
      assert.equal(getLeadLabel(3 * 24 * 3_600_000, now), "in 3 days");
      assert.equal(getLeadLabel(10 * 24 * 3_600_000, now), "in 1 week");
      assert.equal(getLeadLabel(15 * 24 * 3_600_000, now), "in 2 weeks");
   });

   void it("reports a running class as time left", () => {
      const entries = collectNextUpEntries([makeWeek([makeClass({ id: "running", start: "2026-06-16T09:00:00", end: "2026-06-16T10:30:00" })])]);
      const suggestion = getNextUpSuggestion(entries, new Date("2026-06-16T10:00:00+02:00"));
      assert.ok(suggestion);
      assert.equal(suggestion.lead, "30 min left");
   });

   void it("counts down to imminent classes", () => {
      const entries = collectNextUpEntries([makeWeek([makeClass({ id: "target", start: "2026-06-16T13:00:00", end: "2026-06-16T14:30:00" })])]);
      const suggestion = getNextUpSuggestion(entries, new Date("2026-06-16T12:40:00+02:00"));
      assert.ok(suggestion);
      assert.equal(suggestion.lead, "in 20 min");
   });

   void it("names tomorrow and weekdays for classes beyond today", () => {
      const entries = collectNextUpEntries([
         makeWeek([makeClass({ id: "tomorrow", start: "2026-06-17T08:45:00", end: "2026-06-17T10:00:00" })]),
         makeWeek([makeClass({ id: "thursday", start: "2026-06-18T08:45:00", end: "2026-06-18T10:00:00" })]),
      ]);
      const [tomorrowEntry, thursdayEntry] = entries;
      assert.ok(tomorrowEntry && thursdayEntry);
      const now = new Date("2026-06-16T20:00:00+02:00");
      assert.equal(getNextUpDayLabel(tomorrowEntry, now), "Tomorrow");
      assert.equal(getNextUpDayLabel(thursdayEntry, now), "Thu");

      const tomorrow = getNextUpSuggestion(entries, now);
      assert.ok(tomorrow);
      assert.equal(tomorrow.target.schoolClass.id, "tomorrow");
      assert.equal(tomorrow.lead, "Tomorrow");
   });
});
