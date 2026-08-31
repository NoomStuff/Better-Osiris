import { useCallback, useMemo, useState } from "react";
import { getRosterWeekBounds, getIsoWeekNumber, parseIsoDateToLocal, toDayKey, type IsoWeekday } from "../lib/date";
import { getDays, getPositionedClasses, getVisibleDays } from "../lib/weekLayout";
import type { Week, WeekMeta } from "../types/weeks";

export function useAgendaState(displayedData: Week | null, weekOffset: number, perceivedDay: Date | null, shownWeekdays: readonly IsoWeekday[]) {
   const [expandedOverrides, setExpandedOverrides] = useState<Set<string>>(new Set());
   const [animateAgenda, setAnimateAgenda] = useState(false);
   const positionedClasses = useMemo(() => (displayedData ? getPositionedClasses(displayedData.classes) : []), [displayedData]);
   const allDays = useMemo(() => (displayedData ? getDays(displayedData.week, positionedClasses) : []), [displayedData, positionedClasses]);
   const blankWeek = useMemo(() => (perceivedDay ? getBlankWeek(weekOffset, perceivedDay) : null), [perceivedDay, weekOffset]);
   const blankDays = useMemo(() => (blankWeek ? getDays(blankWeek, []) : []), [blankWeek]);
   const visibleDays = useMemo(() => getVisibleDays(displayedData ? allDays : blankDays, shownWeekdays), [allDays, blankDays, displayedData, shownWeekdays]);
   const blankExpandedDays = useMemo(
      () => getDefaultExpandedDays(blankDays, blankWeek?.offset ?? weekOffset, perceivedDay),
      [blankDays, blankWeek, weekOffset, perceivedDay]
   );
   const autoExpandedDays = useMemo(
      () => (displayedData ? getDefaultExpandedDays(allDays, displayedData.week.offset, perceivedDay) : blankExpandedDays),
      [blankExpandedDays, allDays, displayedData, perceivedDay]
   );
   const expandedDays = useMemo(() => {
      const merged = new Set(autoExpandedDays);
      expandedOverrides.forEach((key) => (merged.has(key) ? merged.delete(key) : merged.add(key)));
      return merged;
   }, [autoExpandedDays, expandedOverrides]);
   const allDayKeys = useMemo(() => allDays.map((group) => group.key), [allDays]);

   const toggleDay = useCallback((dayKey: string) => {
      setAnimateAgenda(true);
      setExpandedOverrides((current) => {
         const next = new Set(current);
         if (next.has(dayKey)) next.delete(dayKey);
         else next.add(dayKey);
         return next;
      });
   }, []);

   const expandAllDays = useCallback(() => {
      setAnimateAgenda(true);
      setExpandedOverrides(new Set(allDayKeys.filter((key) => !autoExpandedDays.has(key))));
   }, [allDayKeys, autoExpandedDays]);

   const collapseAllDays = useCallback(() => {
      setAnimateAgenda(true);
      setExpandedOverrides(new Set(autoExpandedDays));
   }, [autoExpandedDays]);

   const resetAgenda = useCallback((animate = false) => {
      setAnimateAgenda(animate);
      setExpandedOverrides(new Set());
   }, []);

   return {
      allDays,
      animateAgenda,
      collapseAllDays,
      expandAllDays,
      positionedClasses,
      resetAgenda,
      toggleDay,
      visibleDays,
      visibleExpandedDays: expandedDays,
   };
}

function getDefaultExpandedDays(days: ReturnType<typeof getDays>, weekOffset: number, now: Date | null) {
   const todayKey = now ? toDayKey(now) : null;
   const nextExpanded = new Set<string>();
   days.forEach((group) => {
      const hasPassed = weekOffset === 0 && todayKey !== null && group.key < todayKey;
      if (!hasPassed && (group.key === todayKey || group.classes.length > 0)) nextExpanded.add(group.key);
   });
   return nextExpanded;
}

function getBlankWeek(offset: number, now: Date): WeekMeta {
   const { start, end } = getRosterWeekBounds(now, offset);
   return { offset, number: getIsoWeekNumber(start), start, end };
}

export function getPerceivedDay(dayKey: string) {
   return parseIsoDateToLocal(dayKey);
}
