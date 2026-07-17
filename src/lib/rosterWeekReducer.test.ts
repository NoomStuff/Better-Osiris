import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { RosterResponse } from "../../shared/roster";
import { createWeekEntry } from "./rosterWeekPolicy";
import { rosterWeekReducer } from "./rosterWeekReducer";

const week = createWeek();

void describe("roster week reducer", () => {
   void it("marks an existing week as refreshing without discarding its data", () => {
      const entries = { 0: createWeekEntry(week) };
      const next = rosterWeekReducer(entries, { type: "fetch-started", offsets: [0], force: true, passive: false });
      const nextEntry = next[0];
      assert.ok(nextEntry);

      assert.equal(nextEntry.data, week);
      assert.equal(nextEntry.isFetching, true);
      assert.equal(entries[0].isFetching, false);
   });

   void it("does not create empty entries during passive refreshes", () => {
      const next = rosterWeekReducer({}, { type: "fetch-started", offsets: [5], force: true, passive: true });
      assert.equal(next[5], undefined);
   });

   void it("replaces changed roster data after a successful fetch", () => {
      const originalLesson = week.lessons[0];
      assert.ok(originalLesson);
      const changed = createWeek({ lessons: [{ ...originalLesson, room: "B202" }] });
      const next = rosterWeekReducer({ 0: createWeekEntry(week) }, { type: "fetch-succeeded", weeks: [changed] });
      const nextEntry = next[0];
      assert.ok(nextEntry);

      assert.equal(nextEntry.data?.lessons[0]?.room, "B202");
      assert.equal(nextEntry.isFetching, false);
      assert.equal(nextEntry.error, null);
   });

   void it("keeps cached data available when a passive fetch fails", () => {
      const error = { title: "Unavailable", detail: "Try later", log: "502", isAuthRelated: false, retryable: true };
      const next = rosterWeekReducer({ 0: createWeekEntry(week, { isFetching: true }) }, { type: "passive-fetch-failed", offsets: [0], error });
      const nextEntry = next[0];
      assert.ok(nextEntry);

      assert.equal(nextEntry.data, week);
      assert.equal(nextEntry.error, error);
      assert.equal(nextEntry.isFetching, false);
   });
});

function createWeek(overrides: Partial<RosterResponse> = {}): RosterResponse {
   return {
      week: { offset: 0, number: 27, start: "2026-06-29", end: "2026-07-03" },
      lessons: [
         {
            id: "lesson",
            title: "Programming",
            subject: "TypeScript",
            start: "2026-06-30T09:00:00",
            end: "2026-06-30T10:00:00",
            teacher: "Teacher",
            room: "A101",
            location: "Main building",
            description: "Lesson",
            status: "scheduled",
         },
      ],
      ...overrides,
   };
}
