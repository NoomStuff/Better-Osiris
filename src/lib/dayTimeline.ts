import type { Class, Day, PositionedClass } from "../types/weeks";
import { toDayKey, getMinutesFromMidnight } from "./date";
import { clamp } from "./clamp";

export interface TimelineSegment {
   type: "schoolClass" | "break";
   key: string;
   startDate: Date;
   endDate: Date;
}
export const isActiveClass = (item: Class) => item.status !== "cancelled";

export function getDayTimeline(classes: readonly PositionedClass[]) {
   const active = classes.filter(isActiveClass).sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
   const breaksBefore = new Map<string, TimelineSegment>();
   const conflicts: [string, string][] = [];
   let occupiedUntil: PositionedClass | undefined;
   active.forEach((item, index) => {
      if (occupiedUntil && occupiedUntil.endDate < item.startDate) {
         breaksBefore.set(item.id, { type: "break", key: `${occupiedUntil.id}--${item.id}`, startDate: occupiedUntil.endDate, endDate: item.startDate });
      }
      for (let other = index - 1; other >= 0; other -= 1) {
         const previous = active[other];
         if (previous && previous.endDate > item.startDate) conflicts.push([previous.id, item.id]);
      }
      if (!occupiedUntil || item.endDate > occupiedUntil.endDate) occupiedUntil = item;
   });
   return { active, breaksBefore, conflicts };
}

export function getBreaktimeLabel(segment: TimelineSegment) {
   const minutes = Math.round((segment.endDate.getTime() - segment.startDate.getTime()) / 60_000);
   if (minutes < 60) return `${minutes} min break`;
   const hours = Math.floor(minutes / 60);
   const rest = minutes % 60;
   return `${hours} hr${hours === 1 ? "" : "s"}${rest ? ` ${rest} min` : ""} break`;
}

export function getCurrentAgendaSegment(days: Day[], now: Date): TimelineSegment | null {
   const day = days.find((group) => group.key === toDayKey(now));
   if (!day) return null;
   const timeline = getDayTimeline(day.classes);
   const current = timeline.active.find((item) => item.startDate <= now && now < item.endDate);
   if (current) return { type: "schoolClass", key: current.id, startDate: current.startDate, endDate: current.endDate };
   return [...timeline.breaksBefore.values()].find((segment) => segment.startDate <= now && now < segment.endDate) ?? null;
}

export function getTodayProgressAnchor(days: Day[], now: Date) {
   const classes = days.find((group) => group.key === toDayKey(now))?.classes.filter(isActiveClass) ?? [];
   const first = classes[0];
   const last = [...classes].sort((a, b) => b.endDate.getTime() - a.endDate.getTime())[0];
   if (first && now < first.startDate) return { position: "before-first" as const, schoolClass: first };
   if (last && now >= last.endDate) return { position: "after-last" as const, schoolClass: last };
   return null;
}

export function getSegmentProgress(segment: TimelineSegment | null, now: Date) {
   if (!segment) return 0;
   const duration = segment.endDate.getTime() - segment.startDate.getTime();
   return duration > 0 ? clamp((now.getTime() - segment.startDate.getTime()) / duration, 0, 1) : 1;
}

/** Calendar semantics are shared; the view decides how to draw this position. */
export function getGridCurrentTime(days: readonly Day[], hours: readonly [number, number], now: Date) {
   const todayKey = toDayKey(now);
   const todayIndex = days.findIndex((day) => day.key === todayKey);
   const minutes = getMinutesFromMidnight(now);
   const start = hours[0] * 60;
   const end = hours[1] * 60;
   return { todayKey, visible: todayIndex >= 0 && minutes >= start && minutes <= end, top: (clamp(minutes - start, 0, end - start) / (end - start)) * 100 };
}
