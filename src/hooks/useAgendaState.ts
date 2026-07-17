import { useCallback, useMemo, useState } from "react";
import { getAmsterdamWeekBounds, getIsoWeekNumber, parseIsoDateToLocal, toDayKey } from "../lib/date";
import { getDayGroups, getPositionedLessons } from "../lib/rosterLayout";
import type { RosterResponse, RosterWeek } from "../types/roster";

export function useAgendaState(displayedData: RosterResponse | null, weekOffset: number, perceivedDay: Date) {
   const [expandedOverrides, setExpandedOverrides] = useState<Set<string>>(new Set());
   const [animateAgenda, setAnimateAgenda] = useState(false);
   const positionedLessons = useMemo(() => (displayedData ? getPositionedLessons(displayedData.lessons) : []), [displayedData]);
   const dayGroups = useMemo(() => (displayedData ? getDayGroups(displayedData.week, positionedLessons) : []), [displayedData, positionedLessons]);
   const blankWeek = useMemo(() => getBlankRosterWeek(weekOffset, perceivedDay), [perceivedDay, weekOffset]);
   const blankDayGroups = useMemo(() => getDayGroups(blankWeek, []), [blankWeek]);
   const blankExpandedDays = useMemo(
      () => getDefaultExpandedDays(blankDayGroups, blankWeek.offset, perceivedDay),
      [blankDayGroups, blankWeek.offset, perceivedDay]
   );
   const autoExpandedDays = useMemo(
      () => (displayedData ? getDefaultExpandedDays(dayGroups, displayedData.week.offset, perceivedDay) : new Set<string>()),
      [dayGroups, displayedData, perceivedDay]
   );
   const expandedDays = useMemo(() => {
      if (!displayedData) return new Set<string>();
      const merged = new Set(autoExpandedDays);
      expandedOverrides.forEach((key) => (merged.has(key) ? merged.delete(key) : merged.add(key)));
      return merged;
   }, [autoExpandedDays, displayedData, expandedOverrides]);
   const allDayKeys = useMemo(() => dayGroups.map((group) => group.key), [dayGroups]);

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
      if (!displayedData) return;
      setAnimateAgenda(true);
      setExpandedOverrides(new Set(allDayKeys.filter((key) => !autoExpandedDays.has(key))));
   }, [allDayKeys, autoExpandedDays, displayedData]);

   const collapseAllDays = useCallback(() => {
      if (!displayedData) return;
      setAnimateAgenda(true);
      setExpandedOverrides(new Set(autoExpandedDays));
   }, [autoExpandedDays, displayedData]);

   const resetAgenda = useCallback((animate = false) => {
      setAnimateAgenda(animate);
      setExpandedOverrides(new Set());
   }, []);

   return {
      animateAgenda,
      collapseAllDays,
      dayGroups,
      expandAllDays,
      positionedLessons,
      resetAgenda,
      toggleDay,
      visibleDayGroups: displayedData ? dayGroups : blankDayGroups,
      visibleExpandedDays: displayedData ? expandedDays : blankExpandedDays,
   };
}

function getDefaultExpandedDays(groups: ReturnType<typeof getDayGroups>, weekOffset: number, now: Date) {
   const todayKey = toDayKey(now);
   const nextExpanded = new Set<string>();
   groups.forEach((group) => {
      const hasPassed = weekOffset === 0 && group.key < todayKey;
      if (!hasPassed && (group.key === todayKey || group.lessons.length > 0)) nextExpanded.add(group.key);
   });
   return nextExpanded;
}

function getBlankRosterWeek(offset: number, now: Date): RosterWeek {
   const { start, end } = getAmsterdamWeekBounds(now, offset);
   return { offset, number: getIsoWeekNumber(start), start, end };
}

export function getPerceivedDay(dayKey: string) {
   return parseIsoDateToLocal(dayKey);
}
