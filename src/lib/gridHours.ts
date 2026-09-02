import type { Day, Week } from "../types/weeks";
import { getMinutesFromMidnight, parseLocalDateTime } from "./date";

export type GridHourRange = readonly [startHour: number, endHour: number];

export const GRID_HOUR_MIN = 0;
export const GRID_HOUR_MAX = 24;
export const DEFAULT_GRID_HOURS: GridHourRange = [8, 18];

export function normalizeGridHourRange(startHour: number, endHour: number): GridHourRange {
   const start = clampHour(Math.round(startHour));
   const end = clampHour(Math.round(endHour));
   if (start < end) {
      return [start, end];
   }

   return start >= GRID_HOUR_MAX ? [GRID_HOUR_MAX - 1, GRID_HOUR_MAX] : [start, start + 1];
}

export function getSmartGridHours(weeks: readonly Week[]): GridHourRange {
   const ranges = weeks.flatMap((week) => week.classes.map(getClassHourBounds));
   if (ranges.length === 0) {
      return DEFAULT_GRID_HOURS;
   }

   return normalizeGridHourRange(Math.min(...ranges.map(([start]) => start)), Math.max(...ranges.map(([, end]) => end)));
}

export function getRequiredGridHours(days: readonly Day[]): GridHourRange | null {
   const ranges = days.flatMap((day) => day.classes.map((schoolClass) => getClassHourBounds(schoolClass)));
   if (ranges.length === 0) {
      return null;
   }

   return normalizeGridHourRange(Math.min(...ranges.map(([start]) => start)), Math.max(...ranges.map(([, end]) => end)));
}

export function countClassesOutsideGridHours(days: readonly Day[], [startHour, endHour]: GridHourRange) {
   const startMinutes = startHour * 60;
   const endMinutes = endHour * 60;
   return days.reduce(
      (count, day) =>
         count +
         day.classes.filter(
            (schoolClass) => getMinutesFromMidnight(schoolClass.startDate) < startMinutes || getMinutesFromMidnight(schoolClass.endDate) > endMinutes
         ).length,
      0
   );
}

export function mergeGridHourRanges(left: GridHourRange, right: GridHourRange): GridHourRange {
   return [Math.min(left[0], right[0]), Math.max(left[1], right[1])];
}

export function formatGridHour(hour: number) {
   return `${String(hour).padStart(2, "0")}:00`;
}

function getClassHourBounds(schoolClass: Pick<Week["classes"][number], "start" | "end">): GridHourRange {
   const startMinutes = getMinutesFromMidnight(parseLocalDateTime(schoolClass.start));
   const endMinutes = getMinutesFromMidnight(parseLocalDateTime(schoolClass.end));
   return [Math.floor(startMinutes / 60), Math.ceil(endMinutes / 60)];
}

function clampHour(hour: number) {
   return Math.min(GRID_HOUR_MAX, Math.max(GRID_HOUR_MIN, hour));
}
