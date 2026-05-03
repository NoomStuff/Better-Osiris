import { parseIsoDateToLocal, parseLocalDateTime, toDayKey } from "./date";
import type { DayGroup, Lesson, PositionedLesson, RosterWeek } from "../types/roster";

export const WORKDAY_START = 8 * 60;
export const WORKDAY_END = 18 * 60;
export const PIXELS_PER_MINUTE = 1.2;

export function getPositionedLessons(lessons: Lesson[]): PositionedLesson[] {
   const positioned = lessons
      .map<PositionedLesson | null>((lesson) => {
         const startDate = parseLocalDateTime(lesson.start);
         const endDate = parseLocalDateTime(lesson.end);
         const startTime = startDate.getTime();
         const endTime = endDate.getTime();

         if (Number.isNaN(startTime) || Number.isNaN(endTime)) {
            return null;
         }

         return {
            ...lesson,
            startDate,
            endDate,
            dayKey: toDayKey(startDate),
            overlapIndex: 0,
            overlapCount: 1,
         };
      })
      .filter((lesson): lesson is PositionedLesson => lesson !== null);

   const byDay = new Map<string, PositionedLesson[]>();
   positioned.forEach((lesson) => {
      const list = byDay.get(lesson.dayKey) ?? [];
      list.push(lesson);
      byDay.set(lesson.dayKey, list);
   });

   byDay.forEach((lessonsForDay) => {
      lessonsForDay.sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
      const columnsEnd: number[] = [];
      let cluster: PositionedLesson[] = [];

      const finalizeCluster = () => {
         if (cluster.length === 0) return;

         const overlapCount = Math.max(...cluster.map((item) => item.overlapIndex)) + 1;
         cluster.forEach((item) => {
            item.overlapCount = overlapCount;
         });
         cluster = [];
      };

      lessonsForDay.forEach((lesson) => {
         const start = lesson.startDate.getTime();
         const end = lesson.endDate.getTime();

         for (let index = 0; index < columnsEnd.length; index += 1) {
            const columnEnd = columnsEnd[index];
            if (columnEnd !== undefined && columnEnd <= start) {
               columnsEnd[index] = 0;
            }
         }

         const overlapsExistingLesson = columnsEnd.some((value) => value > start);
         if (!overlapsExistingLesson) {
            finalizeCluster();
         }

         let assignedIndex = columnsEnd.findIndex((value) => value <= start);
         if (assignedIndex === -1) {
            assignedIndex = columnsEnd.length;
            columnsEnd.push(end);
         } else {
            columnsEnd[assignedIndex] = end;
         }

         lesson.overlapIndex = assignedIndex;
         cluster.push(lesson);
      });

      finalizeCluster();
   });

   return positioned;
}

export function getDayGroups(week: RosterWeek, lessons: PositionedLesson[]): DayGroup[] {
   const weekStart = parseIsoDateToLocal(week.start);
   const startDay = weekStart.getDay();
   const monday = new Date(weekStart);
   if (startDay === 0) {
      monday.setDate(weekStart.getDate() + 1);
   } else {
      monday.setDate(weekStart.getDate() - (startDay - 1));
   }
   const groups: DayGroup[] = [];

   for (let index = 0; index < 5; index += 1) {
      const date = new Date(monday);
      date.setDate(monday.getDate() + index);
      const key = toDayKey(date);

      groups.push({
         key,
         date,
         lessons: lessons.filter((lesson) => lesson.dayKey === key).sort((a, b) => a.startDate.getTime() - b.startDate.getTime()),
      });
   }

   return groups;
}
