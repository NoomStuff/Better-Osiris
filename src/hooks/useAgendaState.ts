import { useCallback, useMemo, useState } from "react";
import { toDayKey } from "../lib/date";
import type { AgendaFoldingMode } from "./useAgendaFoldingPreference";
import type { Day } from "../types/weeks";

export function useAgendaState(days: Day[], weekOffset: number, perceivedDay: Date | null, foldingMode: AgendaFoldingMode) {
   const [expandedOverrides, setExpandedOverrides] = useState<Set<string>>(new Set());
   const [animateAgenda, setAnimateAgenda] = useState(false);
   const autoExpandedDays = useMemo(() => getDefaultExpandedDays(days, weekOffset, perceivedDay, foldingMode), [days, foldingMode, perceivedDay, weekOffset]);
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

export function getDefaultExpandedDays(days: Day[], weekOffset: number, now: Date | null, foldingMode: AgendaFoldingMode) {
   const todayKey = now ? toDayKey(now) : null;
   if (foldingMode === "all") {
      return new Set(days.map((day) => day.key));
   }
   if (foldingMode === "single") {
      return new Set(weekOffset === 0 && todayKey ? [todayKey] : []);
   }

   const nextExpanded = new Set<string>();
   days.forEach((group) => {
      const hasPassed = weekOffset === 0 && todayKey !== null && group.key < todayKey;
      if (!hasPassed && (group.key === todayKey || group.classes.length > 0)) nextExpanded.add(group.key);
   });
   return nextExpanded;
}
