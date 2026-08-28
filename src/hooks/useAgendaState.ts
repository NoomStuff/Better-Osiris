import { useCallback, useMemo, useState } from "react";
import { getRosterWeekBounds, getIsoWeekNumber, parseIsoDateToLocal, toDayKey } from "../lib/date";
import { getDays, getPositionedClasses, getVisibleDays } from "../lib/weekLayout";
import type { Week, WeekMeta } from "../types/weeks";

export function useAgendaState(displayedData: Week | null, weekOffset: number, perceivedDay: Date | null) {
   const [expandedOverrides, setExpandedOverrides] = useState<Set<string>>(new Set());
   const [animateAgenda, setAnimateAgenda] = useState(false);
   const positionedClasses = useMemo(() => (displayedData ? getPositionedClasses(displayedData.classes) : []), [displayedData]);
   const days = useMemo(() => (displayedData ? getVisibleDays(getDays(displayedData.week, positionedClasses)) : []), [displayedData, positionedClasses]);
   const blankWeek = useMemo(() => (perceivedDay ? getBlankWeek(weekOffset, perceivedDay) : null), [perceivedDay, weekOffset]);
   const blankDays = useMemo(() => (blankWeek ? getVisibleDays(getDays(blankWeek, [])) : []), [blankWeek]);
   const blankExpandedDays = useMemo(
      () => getDefaultExpandedDays(blankDays, blankWeek?.offset ?? weekOffset, perceivedDay),
      [blankDays, blankWeek, weekOffset, perceivedDay]
   );
   const autoExpandedDays = useMemo(
      () => (displayedData ? getDefaultExpandedDays(days, displayedData.week.offset, perceivedDay) : blankExpandedDays),
      [blankExpandedDays, days, displayedData, perceivedDay]
   );
   const expandedDays = useMemo(() => {
      const merged = new Set(autoExpandedDays);
      expandedOverrides.forEach((key) => (merged.has(key) ? merged.delete(key) : merged.add(key)));
      return merged;
   }, [autoExpandedDays, expandedOverrides]);
   const allDayKeys = useMemo(() => days.map((group) => group.key), [days]);

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
      animateAgenda,
      collapseAllDays,
      days,
      expandAllDays,
      positionedClasses,
      resetAgenda,
      toggleDay,
      visibleDays: displayedData ? days : blankDays,
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
