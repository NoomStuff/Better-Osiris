import { getIsoWeekday, parseIsoDateToLocal, parseLocalDateTime, shiftIsoDateByDays, toDayKey } from "./date";
import type { Day, Class, PositionedClass, WeekMeta } from "../types/weeks";

export const WORKDAY_START = 8 * 60;
export const WORKDAY_END = 18 * 60;

export const DAYS_PER_WEEK = 7;

/**
 * ISO weekday numbers (1 = Monday … 7 = Sunday) the views render. A class on any weekday is always
 * grouped into its day; days outside this set simply stay hidden. Meant to become a per-day setting.
 */
export const DEFAULT_VISIBLE_ISO_WEEKDAYS: readonly number[] = [1, 2, 3, 4, 5];

export function getVisibleDays(days: Day[], visibleWeekdays: readonly number[] = DEFAULT_VISIBLE_ISO_WEEKDAYS): Day[] {
   return days.filter((day) => visibleWeekdays.includes(getIsoWeekday(day.key)));
}

export function getPositionedClasses(classes: Class[]): PositionedClass[] {
   const positioned = classes
      .map<PositionedClass | null>((schoolClass) => {
         const startDate = parseLocalDateTime(schoolClass.start);
         const endDate = parseLocalDateTime(schoolClass.end);
         const startTime = startDate.getTime();
         const endTime = endDate.getTime();

         if (Number.isNaN(startTime) || Number.isNaN(endTime) || endTime <= startTime) {
            return null;
         }

         return {
            ...schoolClass,
            startDate,
            endDate,
            dayKey: toDayKey(startDate),
            overlapIndex: 0,
            overlapCount: 1,
         };
      })
      .filter((schoolClass): schoolClass is PositionedClass => schoolClass !== null);

   const byDay = new Map<string, PositionedClass[]>();
   positioned.forEach((schoolClass) => {
      const list = byDay.get(schoolClass.dayKey) ?? [];
      list.push(schoolClass);
      byDay.set(schoolClass.dayKey, list);
   });

   byDay.forEach((classesForDay) => {
      classesForDay.sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
      const columnsEnd: number[] = [];
      let cluster: PositionedClass[] = [];

      const finalizeCluster = () => {
         if (cluster.length === 0) return;

         const overlapCount = Math.max(...cluster.map((item) => item.overlapIndex)) + 1;
         cluster.forEach((item) => {
            item.overlapCount = overlapCount;
         });
         cluster = [];
      };

      classesForDay.forEach((schoolClass) => {
         const start = schoolClass.startDate.getTime();
         const end = schoolClass.endDate.getTime();

         for (let index = 0; index < columnsEnd.length; index += 1) {
            const columnEnd = columnsEnd[index];
            if (columnEnd !== undefined && columnEnd <= start) {
               columnsEnd[index] = 0;
            }
         }

         const overlapsExistingClass = columnsEnd.some((value) => value > start);
         if (!overlapsExistingClass) {
            finalizeCluster();
         }

         let assignedIndex = columnsEnd.findIndex((value) => value <= start);
         if (assignedIndex === -1) {
            assignedIndex = columnsEnd.length;
            columnsEnd.push(end);
         } else {
            columnsEnd[assignedIndex] = end;
         }

         schoolClass.overlapIndex = assignedIndex;
         cluster.push(schoolClass);
      });

      finalizeCluster();
   });

   return positioned;
}

export function getDays(week: WeekMeta, classes: PositionedClass[]): Day[] {
   const groups: Day[] = [];

   for (let index = 0; index < DAYS_PER_WEEK; index += 1) {
      const key = shiftIsoDateByDays(week.start, index);
      const date = parseIsoDateToLocal(key);

      groups.push({
         key,
         date,
         classes: classes.filter((schoolClass) => schoolClass.dayKey === key).sort((a, b) => a.startDate.getTime() - b.startDate.getTime()),
      });
   }

   return groups;
}
