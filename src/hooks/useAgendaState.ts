import { useCallback, useMemo, useState } from "react";
import { getDefaultExpandedDays } from "../lib/agendaPolicy";
import type { AgendaFoldingMode } from "../lib/agendaPolicy";
import type { Day } from "../types/weeks";

export function useAgendaState(days: Day[], perceivedDay: Date | null, foldingMode: AgendaFoldingMode, isHomeWeek: boolean, nextClassDay: string | null) {
   const [expandedOverrides, setExpandedOverrides] = useState<Map<string, boolean>>(new Map());
   const [animateAgenda, setAnimateAgenda] = useState(false);
   const autoExpandedDays = useMemo(
      () => getDefaultExpandedDays(days, perceivedDay, foldingMode, isHomeWeek, nextClassDay),
      [days, foldingMode, perceivedDay, isHomeWeek, nextClassDay]
   );
   const expandedDays = useMemo(() => {
      const merged = new Set(autoExpandedDays);
      expandedOverrides.forEach((open, key) => (open ? merged.add(key) : merged.delete(key)));
      return merged;
   }, [autoExpandedDays, expandedOverrides]);
   const allDayKeys = useMemo(() => days.map((group) => group.key), [days]);

   const toggleDay = useCallback(
      (dayKey: string) => {
         setAnimateAgenda(true);
         setExpandedOverrides((current) => {
            const next = new Map(current);
            next.set(dayKey, !(current.get(dayKey) ?? autoExpandedDays.has(dayKey)));
            return next;
         });
      },
      [autoExpandedDays]
   );

   const expandAllDays = useCallback(() => {
      setAnimateAgenda(true);
      setExpandedOverrides(new Map(allDayKeys.map((key) => [key, true])));
   }, [allDayKeys]);

   const collapseAllDays = useCallback(() => {
      setAnimateAgenda(true);
      setExpandedOverrides(new Map(allDayKeys.map((key) => [key, false])));
   }, [allDayKeys]);

   const resetAgenda = useCallback((animate = false) => {
      setAnimateAgenda(animate);
      setExpandedOverrides(new Map());
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
