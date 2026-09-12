import { notifyUpcomingClasses } from "../lib/classReminders";
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { WeekRepository, type WeekRepositoryOptions } from "../lib/weekRepository";
import { canNavigateToWeek, getDerivedWeekTitle, getHomeWeek, getAdjacentWeekOffset } from "../lib/weekPolicy";
import { useClock } from "./useClock";
import { isRosterTimeZoneKnown } from "../lib/rosterTimeZone";
import type { Week } from "../types/weeks";

export function useWeeks(offset: number, options: WeekRepositoryOptions) {
   const [repository] = useState(() => new WeekRepository());
   const { entries, lastSuccessfulResetKey, sourceShift } = useSyncExternalStore(repository.subscribe, repository.getSnapshot);
   useEffect(() => repository.start(), [repository]);
   const { enabled, clearCache, contextId, resetKey, timeZone } = options;
   useEffect(
      () => repository.configure({ enabled, clearCache, contextId, resetKey, timeZone }, offset),
      [repository, enabled, clearCache, contextId, resetKey, timeZone, offset]
   );
   useEffect(() => {
      if (!enabled || !contextId || lastSuccessfulResetKey !== resetKey) return;
      let active = true;
      const classes = Object.values(entries).flatMap((entry) => entry?.data?.classes ?? []);
      const check = () => void notifyUpcomingClasses(classes, contextId, () => active);
      check();
      const timer = window.setInterval(check, 15_000);
      window.addEventListener("storage", check);
      document.addEventListener("visibilitychange", check);
      return () => {
         active = false;
         window.clearInterval(timer);
         window.removeEventListener("storage", check);
         document.removeEventListener("visibilitychange", check);
      };
   }, [entries, enabled, contextId, lastSuccessfulResetKey, resetKey]);
   const active = entries[offset];
   const clock = useClock(60_000);
   const home = useMemo(
      () => (!clearCache && isRosterTimeZoneKnown() ? getHomeWeek(entries, sourceShift, clock) : null),
      [entries, sourceShift, clock, clearCache]
   );
   useEffect(() => {
      if (enabled && home?.pendingOffset !== null && home?.pendingOffset !== undefined) repository.ensureWeek(home.pendingOffset);
   }, [enabled, home?.pendingOffset, entries, repository]);
   const [now, setNow] = useState(Date.now);
   const retryAt = active?.retryAt ?? 0;
   useEffect(() => {
      if (!retryAt) return;
      const timer = window.setInterval(() => setNow(Date.now()), 1000);
      return () => window.clearInterval(timer);
   }, [retryAt]);
   const data = clearCache ? null : (active?.data ?? null);
   const error = clearCache ? null : (active?.error ?? null);
   const weekNotReturned = !clearCache && Boolean(active?.isOmitted);
   const isWeekNavigable = useCallback((target: number) => !clearCache && canNavigateToWeek(target, entries, sourceShift), [clearCache, entries, sourceShift]);
   const firstOffset = Math.max(0, sourceShift ?? 0);
   const previousWeekOffset = clearCache ? null : getAdjacentWeekOffset(offset, -1, entries, sourceShift);
   const nextWeekOffset = clearCache ? null : getAdjacentWeekOffset(offset, 1, entries, sourceShift);
   const knownWeeks = useMemo(() => (clearCache ? [] : Object.values(entries).flatMap((entry) => (entry?.data ? [entry.data] : []))), [entries, clearCache]);
   const initialWeeks = useMemo(
      () => Array.from({ length: 5 }, (_, index) => entries[firstOffset + index]?.data).filter((week): week is Week => Boolean(week)),
      [entries, firstOffset]
   );
   return {
      data,
      error,
      initialWeeks,
      knownWeeks,
      homeWeekOffset: home?.offset ?? null,
      homePendingOffset: home?.pendingOffset ?? null,
      previousWeekOffset,
      nextWeekOffset,
      lastSuccessfulResetKey,
      isWeekNavigable,
      weekNotReturned,
      areInitialWeeksLoaded: initialWeeks.length === 5,
      canGoPrevious: previousWeekOffset !== null,
      canGoNext: nextWeekOffset !== null,
      loading: enabled && !data && !error && (!weekNotReturned || Boolean(active?.isFetching)),
      refreshing: Boolean(data && active?.isFetching),
      retrying: Boolean(!data && active?.isFetching && error),
      retryCountdownMs: retryAt ? Math.max(0, retryAt - now) : 0,
      refresh: repository.refresh,
      title: clearCache ? "Loading week..." : getDerivedWeekTitle(offset, entries),
   };
}
