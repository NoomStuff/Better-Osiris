import { useCallback, useMemo, useState } from "react";
import { parseLocalDateTime, toDayKey } from "../lib/date";
import type { AgendaFoldingMode } from "./useAgendaFoldingPreference";
import type { Day, Week } from "../types/weeks";

export function useAgendaState(days: Day[], perceivedDay: Date | null, foldingMode: AgendaFoldingMode, isHomeWeek: boolean, nextClassDay: string | null) {
   const [expandedOverrides, setExpandedOverrides] = useState<Set<string>>(new Set());
   const [animateAgenda, setAnimateAgenda] = useState(false);
   const autoExpandedDays = useMemo(
      () => getDefaultExpandedDays(days, perceivedDay, foldingMode, isHomeWeek, nextClassDay),
      [days, foldingMode, perceivedDay, isHomeWeek, nextClassDay]
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
      expandAllDays,
      resetAgenda,
      toggleDay,
      visibleExpandedDays: expandedDays,
   };
}

export function getDefaultExpandedDays(days: Day[], now: Date | null, foldingMode: AgendaFoldingMode, isHomeWeek: boolean, nextClassDay: string | null) {
   const todayKey = now ? toDayKey(now) : null;
   if (foldingMode === "all") {
      return new Set(days.map((day) => day.key));
   }
   return new Set(
      days
         .filter((day) => {
            if (foldingMode === "single") return day.key === nextClassDay;
            if (!isHomeWeek) return day.classes.length > 0;
            return day.key === todayKey || (todayKey !== null && day.key > todayKey && day.classes.length > 0);
         })
         .map((day) => day.key)
   );
}

export function getNextClassDay(weeks: Week[], now: Date): string | null {
   let nextStart: Date | null = null;
   for (const week of weeks) {
      for (const item of week.classes) {
         if (item.status === "cancelled") continue;
         const start = parseLocalDateTime(item.start);
         if (start >= now && (nextStart === null || start < nextStart)) nextStart = start;
      }
   }
   return nextStart ? toDayKey(nextStart) : null;
}
