import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getDayTimeline, getCurrentAgendaSegment } from "./dayTimeline";
import { setRosterTimeZone } from "./rosterTimeZone";
import { parseLocalDateTime } from "./date";
import type { PositionedClass, Day } from "../types/weeks";

function item(id: string, start: string, end: string, cancelled = false): PositionedClass {
   const startValue = `2026-06-16T${start}:00`;
   const endValue = `2026-06-16T${end}:00`;
   return {
      id,
      title: id,
      subject: "",
      room: "",
      teacher: "",
      location: "",
      description: "",
      status: cancelled ? "cancelled" : "scheduled",
      start: startValue,
      end: endValue,
      startDate: parseLocalDateTime(startValue),
      endDate: parseLocalDateTime(endValue),
      dayKey: "2026-06-16",
      overlapIndex: 0,
      overlapCount: 1,
   };
}
void describe("occupied day intervals", () => {
   void it("never inserts free time inside a longer overlapping class", () => {
      setRosterTimeZone("Europe/Amsterdam");
      const timeline = getDayTimeline([
         item("long", "09:00", "12:00"),
         item("short", "09:30", "10:00"),
         item("third", "11:00", "11:30"),
         item("next", "13:00", "14:00"),
      ]);
      assert.deepEqual([...timeline.breaksBefore.keys()], ["next"]);
      assert.equal(timeline.breaksBefore.get("next")?.startDate.getTime(), parseLocalDateTime("2026-06-16T12:00:00").getTime());
      assert.deepEqual(timeline.conflicts, [
         ["long", "short"],
         ["long", "third"],
      ]);
   });
   void it("excludes cancelled classes from occupied time and current-class selection", () => {
      setRosterTimeZone("Europe/Amsterdam");
      const classes = [item("cancelled", "09:00", "12:00", true), item("a", "09:00", "10:00"), item("b", "11:00", "12:00")];
      const day: Day = { key: "2026-06-16", date: parseLocalDateTime("2026-06-16T00:00:00"), classes };
      assert.equal(getDayTimeline(classes).active.length, 2);
      assert.equal(getCurrentAgendaSegment([day], parseLocalDateTime("2026-06-16T10:30:00"))?.type, "break");
   });
});
