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
   void it("picks the earliest upcoming active class across weeks, ignoring cancelled ones", () => {
      const entries = collectNextUpEntries([
         makeWeek([makeClass({ id: "past", start: "2026-06-15T10:00:00", end: "2026-06-15T11:00:00" })]),
         makeWeek([
            makeClass({ id: "died", start: "2026-06-16T11:00:00", end: "2026-06-16T12:00:00", status: "cancelled" }),
            makeClass({ id: "target", start: "2026-06-16T13:00:00", end: "2026-06-16T14:30:00" }),
         ]),
      ]);
      const suggestion = getNextUpSuggestion(entries, new Date("2026-06-16T09:00:00+02:00"));
      assert.ok(suggestion);
      assert.equal(suggestion.phase, "upcoming");
      assert.equal(suggestion.target.schoolClass.id, "target");
   });

   void it("reports the running class with progress", () => {
      const entries = collectNextUpEntries([makeWeek([makeClass({ id: "running", start: "2026-06-16T09:00:00", end: "2026-06-16T10:30:00" })])]);
      const suggestion = getNextUpSuggestion(entries, new Date("2026-06-16T10:00:00+02:00"));
      assert.ok(suggestion);
      assert.equal(suggestion.phase, "now");
      assert.equal(suggestion.target.schoolClass.id, "running");
      assert.equal(suggestion.progress, 2 / 3);
      assert.equal(suggestion.lead, "30 minutes left");
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
      assert.equal(movingOn.lead, "In 37 minutes");
   });

   void it("keeps the running class when the next one is more than a day out", () => {
      const entries = collectNextUpEntries([
         makeWeek([makeClass({ id: "running", start: "2026-06-16T09:00:00", end: "2026-06-16T10:30:00" })]),
         makeWeek([makeClass({ id: "distant", start: "2026-06-19T09:00:00", end: "2026-06-19T10:00:00" })]),
      ]);
      const suggestion = getNextUpSuggestion(entries, new Date("2026-06-16T10:25:00+02:00"));
      assert.ok(suggestion);
      assert.equal(suggestion.phase, "now");
      assert.equal(suggestion.target.schoolClass.id, "running");
      assert.equal(suggestion.lead, "5 minutes left");
   });

   void it("keeps showing the running class when nothing follows it", () => {
      const entries = collectNextUpEntries([makeWeek([makeClass({ id: "running", start: "2026-06-16T09:00:00", end: "2026-06-16T10:30:00" })])]);
      const suggestion = getNextUpSuggestion(entries, new Date("2026-06-16T10:25:00+02:00"));
      assert.ok(suggestion);
      assert.equal(suggestion.phase, "now");
      assert.equal(suggestion.target.schoolClass.id, "running");
      assert.equal(suggestion.lead, "5 minutes left");
   });

   void it("stays hidden until the next class is within a day", () => {
      const distant = collectNextUpEntries([makeWeek([makeClass({ id: "distant", start: "2026-06-17T15:00:00", end: "2026-06-17T16:00:00" })])]);
      assert.equal(getNextUpSuggestion(distant, new Date("2026-06-16T09:00:00+02:00")), null);

      const withinDay = collectNextUpEntries([makeWeek([makeClass({ id: "target", start: "2026-06-17T08:45:00", end: "2026-06-17T10:00:00" })])]);
      const suggestion = getNextUpSuggestion(withinDay, new Date("2026-06-16T20:00:00+02:00"));
      assert.ok(suggestion);
      assert.equal(suggestion.target.schoolClass.id, "target");
      assert.equal(suggestion.lead, "Tomorrow");
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
   void it("leads with minutes, then hours, then Tomorrow", () => {
      const now = new Date("2026-06-16T09:00:00+02:00");
      assert.equal(getLeadLabel(30_000, now), "In 1 minute");
      assert.equal(getLeadLabel(59 * 60_000, now), "In 59 minutes");
      assert.equal(getLeadLabel(60 * 60_000, now), "In 1 hour");
      assert.equal(getLeadLabel(65 * 60_000, now), "In 1 hour 5 minutes");
      assert.equal(getLeadLabel(3.4 * 3_600_000, now), "In 3 hours");
      assert.equal(getLeadLabel(11 * 3_600_000, now), "In 11 hours");
      // 13 hours ahead lands the same evening, so the clock keeps counting.
      assert.equal(getLeadLabel(13 * 3_600_000, now), "In 13 hours");
      // 12.75 hours ahead crosses midnight, so the calendar word takes over.
      assert.equal(getLeadLabel(12.75 * 3_600_000, new Date("2026-06-16T20:00:00+02:00")), "Tomorrow");
      // Just after midnight a class at half past is an hour away, not "Tomorrow".
      assert.equal(getLeadLabel(60 * 60_000, new Date("2026-06-16T23:30:00+02:00")), "In 1 hour");
   });

   void it("marks the next calendar day as Tomorrow and today as none", () => {
      const entries = collectNextUpEntries([
         makeWeek([makeClass({ id: "today", start: "2026-06-16T21:00:00", end: "2026-06-16T22:00:00" })]),
         makeWeek([makeClass({ id: "tomorrow", start: "2026-06-17T08:45:00", end: "2026-06-17T10:00:00" })]),
      ]);
      const [todayEntry, tomorrowEntry] = entries;
      assert.ok(todayEntry && tomorrowEntry);
      const now = new Date("2026-06-16T20:00:00+02:00");
      assert.equal(getNextUpDayLabel(todayEntry, now), null);
      assert.equal(getNextUpDayLabel(tomorrowEntry, now), "Tomorrow");
   });
});
