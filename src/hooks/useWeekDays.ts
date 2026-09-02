import { useMemo } from "react";
import { getIsoWeekNumber, getRosterWeekBounds, parseIsoDateToLocal, type IsoWeekday } from "../lib/date";
import { getDays, getPositionedClasses, getVisibleDays } from "../lib/weekLayout";
import type { Week, WeekMeta } from "../types/weeks";

export function useWeekDays(displayedWeek: Week | null, weekOffset: number, perceivedDay: Date | null, shownWeekdays: readonly IsoWeekday[]) {
   const positionedClasses = useMemo(() => (displayedWeek ? getPositionedClasses(displayedWeek.classes) : []), [displayedWeek]);
   const fallbackWeek = useMemo(() => (perceivedDay ? getBlankWeek(weekOffset, perceivedDay) : null), [perceivedDay, weekOffset]);
   const allDays = useMemo(
      () => (displayedWeek ? getDays(displayedWeek.week, positionedClasses) : fallbackWeek ? getDays(fallbackWeek, []) : []),
      [displayedWeek, fallbackWeek, positionedClasses]
   );
   const visibleDays = useMemo(() => getVisibleDays(allDays, shownWeekdays), [allDays, shownWeekdays]);

   return { allDays, visibleDays };
}

function getBlankWeek(offset: number, now: Date): WeekMeta {
   const { start, end } = getRosterWeekBounds(now, offset);
   return { offset, number: getIsoWeekNumber(start), start, end };
}

export function getPerceivedDay(dayKey: string) {
   return parseIsoDateToLocal(dayKey);
}
