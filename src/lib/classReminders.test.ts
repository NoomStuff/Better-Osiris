import assert from "node:assert/strict";
import { it } from "node:test";
import { getClassReminderBody, getClassReminderExpiry, getNextReminderCheckDelay, isClassReminderDue } from "./classReminders";
import { setRosterTimeZone } from "./rosterTimeZone";
import type { Class } from "../types/weeks";
void it("reminds only within the lead window, using the roster time zone", () => {
   setRosterTimeZone("Europe/Amsterdam");
   const item: Class = {
      id: "a",
      title: "Class",
      subject: "",
      start: "2026-06-16T10:30:00",
      end: "2026-06-16T11:30:00",
      teacher: "",
      room: "",
      location: "",
      description: "",
      status: "scheduled",
   };
   const start = Date.parse("2026-06-16T08:30:00Z");
   assert.equal(isClassReminderDue(item, 5, start - 300001), false);
   assert.equal(isClassReminderDue(item, 5, start - 300000), true);
   assert.equal(isClassReminderDue(item, 5, start - 1), true);
   assert.equal(isClassReminderDue(item, 5, start), false);
   assert.equal(isClassReminderDue({ ...item, status: "cancelled" }, 5, start - 1000), false);
   assert.equal(isClassReminderDue({ ...item, start: "2026-06-16T11:30:00" }, 5, start - 1000), false);
});

void it("formats remaining minutes and omits an unavailable room", () => {
   const item = { title: "Math", room: "B12", start: "2026-06-16T08:30:00Z" };
   const start = Date.parse(item.start);
   assert.equal(getClassReminderBody(item, start - 300000), "Math is starting in 5 minutes in room B12");
   assert.equal(getClassReminderBody(item, start - 45000), "Math is starting in 1 minute in room B12");
   assert.equal(getClassReminderBody({ ...item, room: " " }, start - 120000), "Math is starting in 2 minutes");
});

void it("expires at the next later reminder or the class end, ignoring cancelled and simultaneous classes", () => {
   const item: Class = {
      id: "a",
      title: "A",
      subject: "",
      start: "2026-06-16T10:00:00Z",
      end: "2026-06-16T11:00:00Z",
      teacher: "",
      room: "",
      location: "",
      description: "",
      status: "scheduled",
   };
   const next: Class = { ...item, id: "b", start: "2026-06-16T11:00:00Z", end: "2026-06-16T12:00:00Z" };
   assert.equal(getClassReminderExpiry(item, [item, next], 5), Date.parse("2026-06-16T10:55:00Z"));
   assert.equal(getClassReminderExpiry(item, [item, next], 10), Date.parse("2026-06-16T10:50:00Z"));
   assert.equal(getClassReminderExpiry(item, [item, { ...next, status: "cancelled" }], 5), Date.parse(item.end));
   assert.equal(getClassReminderExpiry(item, [item, { ...next, start: item.start }], 5), Date.parse(item.end));
   assert.equal(getClassReminderExpiry(item, [item, { ...next, start: "2026-06-16T12:00:00Z" }], 5), Date.parse(item.end));
});

const LEAD_MS = 5 * 60_000;

function classAt(id: string, start: string, end: string, status: "scheduled" | "cancelled" = "scheduled"): Class {
   return { id, title: id, subject: "", start, end, teacher: "", room: "", location: "", description: "", status };
}

void it("schedules the next check at the nearest reminder or expiry moment", () => {
   const now = Date.parse("2026-06-16T09:00:00Z");
   const morning = classAt("a", "2026-06-16T09:30:00Z", "2026-06-16T10:30:00Z");
   const afternoon = classAt("b", "2026-06-16T11:00:00Z", "2026-06-16T12:00:00Z");

   assert.equal(getNextReminderCheckDelay([morning, afternoon], LEAD_MS, now), Date.parse("2026-06-16T09:25:00Z") - now);
   assert.equal(getNextReminderCheckDelay([{ ...morning, status: "cancelled" }, afternoon], LEAD_MS, now), Date.parse("2026-06-16T10:55:00Z") - now);
   // A class in progress waits for its end so the stale reminder gets swept.
   assert.equal(
      getNextReminderCheckDelay([classAt("c", "2026-06-16T08:30:00Z", "2026-06-16T09:15:00Z")], LEAD_MS, now),
      Date.parse("2026-06-16T09:15:00Z") - now
   );
   assert.equal(
      getNextReminderCheckDelay([morning, afternoon, classAt("d", "2026-06-16T09:10:00Z", "2026-06-16T09:20:00Z")], LEAD_MS, now),
      Date.parse("2026-06-16T09:05:00Z") - now
   );
});

void it("reports no pending check when every class is over", () => {
   const now = Date.parse("2026-06-16T09:00:00Z");
   assert.equal(getNextReminderCheckDelay([], LEAD_MS, now), null);
   assert.equal(getNextReminderCheckDelay([classAt("a", "2026-06-16T08:00:00Z", "2026-06-16T08:50:00Z")], LEAD_MS, now), null);
});
