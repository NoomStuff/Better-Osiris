import assert from "node:assert/strict";
import { it } from "node:test";
import { getClassReminderBody, isClassReminderDue } from "./classReminders";
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
