import { useCallback, useMemo, useState } from "react";
import { getDefaultExpandedDays } from "../lib/agendaPolicy";
import type { AgendaFoldingMode } from "../lib/agendaPolicy";
import type { Day } from "../types/weeks";

interface AgendaResetKey {
   weekOffset: number;
   homeRevision: number;
   foldingPreference: AgendaFoldingMode;
}

/**
 * Manual folding is absolute per day and lasts until the week changes, Home is applied again, or
 * the folding preference changes. Only the last two animate: a new week mounts a fresh frame.
 */
export function useAgendaState(
   days: Day[],
   perceivedDay: Date | null,
   foldingMode: AgendaFoldingMode,
   isHomeWeek: boolean,
   nextClassDay: string | null,
   resetKey: AgendaResetKey
) {
   const [expandedOverrides, setExpandedOverrides] = useState<ReadonlyMap<string, boolean>>(new Map());
   const [animateAgenda, setAnimateAgenda] = useState(true);
   const [seenResetKey, setSeenResetKey] = useState(resetKey);
   if (
      seenResetKey.weekOffset !== resetKey.weekOffset ||
      seenResetKey.homeRevision !== resetKey.homeRevision ||
      seenResetKey.foldingPreference !== resetKey.foldingPreference
   ) {
      setSeenResetKey(resetKey);
      setExpandedOverrides(new Map());
      setAnimateAgenda(seenResetKey.weekOffset === resetKey.weekOffset);
   }
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

   const setAllDays = useCallback(
      (open: boolean) => {
         setAnimateAgenda(true);
         setExpandedOverrides(new Map(allDayKeys.map((key) => [key, open])));
      },
      [allDayKeys]
   );
   const expandAllDays = useCallback(() => setAllDays(true), [setAllDays]);
   const collapseAllDays = useCallback(() => setAllDays(false), [setAllDays]);

   return {
      animateAgenda,
      collapseAllDays,
      expandAllDays,
      toggleDay,
      visibleExpandedDays: expandedDays,
   };
}
