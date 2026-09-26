import { useCallback, useMemo, useState } from "react";
import { getDefaultExpandedDays } from "../lib/agendaPolicy";
import type { AgendaFoldingMode } from "../lib/agendaPolicy";
import type { Day } from "../types/weeks";

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
