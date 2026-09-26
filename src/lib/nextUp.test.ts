import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { collectNextUpEntries, getNextUpDayLabel, getNextUpDurationLabel, getNextUpSuggestion, getNextUpSummary } from "./nextUp.js";
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
});

void describe("next up labels", () => {
   void it("formats durations, rounding the last minute up", () => {
      assert.equal(getNextUpDurationLabel(30_000), "1 min");
      assert.equal(getNextUpDurationLabel(59 * 60_000), "59 min");
      assert.equal(getNextUpDurationLabel(60 * 60_000), "1 hr");
      assert.equal(getNextUpDurationLabel(65 * 60_000), "1 hr 5 min");
      assert.equal(getNextUpDurationLabel(120 * 60_000), "2 hrs");
   });

   void it("summarizes a running class as time left", () => {
      const entries = collectNextUpEntries([makeWeek([makeClass({ id: "running", start: "2026-06-16T09:00:00", end: "2026-06-16T10:30:00" })])]);
      const suggestion = getNextUpSuggestion(entries, new Date("2026-06-16T10:00:00+02:00"));
      assert.ok(suggestion);
      assert.equal(getNextUpSummary(suggestion, new Date("2026-06-16T10:00:00+02:00")), "Now · 30 min left");
   });

   void it("counts down to imminent classes and names the day for distant ones", () => {
      const entries = collectNextUpEntries([makeWeek([makeClass({ id: "target", start: "2026-06-16T13:00:00", end: "2026-06-16T14:30:00" })])]);
      const imminent = getNextUpSuggestion(entries, new Date("2026-06-16T12:40:00+02:00"));
      assert.ok(imminent);
      assert.equal(getNextUpSummary(imminent, new Date("2026-06-16T12:40:00+02:00")), "in 20 min");

      const distant = getNextUpSuggestion(entries, new Date("2026-06-16T09:00:00+02:00"));
      assert.ok(distant);
      assert.equal(getNextUpSummary(distant, new Date("2026-06-16T09:00:00+02:00")), "Today 13:00");
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
      assert.equal(getNextUpSummary(tomorrow, now), "Tomorrow 08:45");

      const weekdayOnly = collectNextUpEntries([makeWeek([makeClass({ id: "thursday", start: "2026-06-18T08:45:00", end: "2026-06-18T10:00:00" })])]);
      const later = getNextUpSuggestion(weekdayOnly, now);
      assert.ok(later);
      assert.equal(getNextUpSummary(later, now), "Thu 08:45");
   });

   void it("uses today for a distant class later today", () => {
      const entries = collectNextUpEntries([makeWeek([makeClass({ id: "target", start: "2026-06-16T21:00:00", end: "2026-06-16T22:00:00" })])]);
      const [entry] = entries;
      assert.ok(entry);
      const now = new Date("2026-06-16T09:00:00+02:00");
      assert.equal(getNextUpDayLabel(entry, now), null);
      const suggestion = getNextUpSuggestion(entries, now);
      assert.ok(suggestion);
      assert.equal(getNextUpSummary(suggestion, now), "Today 21:00");
   });
});
