import { useClassReminders } from "./useClassReminders";
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { WeekRepository, type WeekRepositoryOptions } from "../lib/weekRepository";
import { ROSTER_BATCH_SIZE, canNavigateToWeek, getDerivedWeekTitle, getHomeWeek, getAdjacentWeekOffset } from "../lib/weekPolicy";
import { useClock } from "./useClock";
import { isRosterTimeZoneKnown } from "../lib/rosterTimeZone";

export function useWeeks(offset: number, options: WeekRepositoryOptions) {
   const [repository] = useState(() => new WeekRepository());
   const { entries, knownWeeks: contentWeeks, lastSuccessfulResetKey, sourceShift } = useSyncExternalStore(repository.subscribe, repository.getSnapshot);
   useEffect(() => repository.start(), [repository]);
   const { enabled, clearCache, contextId, resetKey, timeZone, verifiedBatch } = options;
   useEffect(
      () => repository.configure({ enabled, clearCache, contextId, resetKey, timeZone, verifiedBatch: verifiedBatch ?? null }, offset),
      [repository, enabled, clearCache, contextId, resetKey, timeZone, verifiedBatch, offset]
   );
   useClassReminders(contentWeeks, contextId, enabled && lastSuccessfulResetKey === resetKey);
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
   const knownWeeks = useMemo(() => (clearCache ? [] : contentWeeks), [contentWeeks, clearCache]);
   const initialWeeks = useMemo(
      () => (clearCache ? [] : knownWeeks.filter((week) => week.week.offset >= firstOffset && week.week.offset < firstOffset + ROSTER_BATCH_SIZE)),
      [knownWeeks, firstOffset, clearCache]
   );
   return {
      data,
      fetchedAt: active?.fetchedAt ?? 0,
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
      areInitialWeeksLoaded:
         !clearCache &&
         initialWeeks.length > 0 &&
         Array.from({ length: ROSTER_BATCH_SIZE }, (_, index) => entries[firstOffset + index]).every((entry) => Boolean(entry?.data) || entry?.isOmitted),
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
