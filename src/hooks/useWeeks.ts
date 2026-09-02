import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { fetchWeeks } from "../api/weeks";
import { notifyError } from "../lib/notyf";
import { clearWeekBrowserCache } from "../lib/weekCache";
import { getRosterTimeZone, isRosterTimeZoneKnown, setRosterTimeZone } from "../lib/rosterTimeZone";
import { toWeekLoadError } from "../lib/weekLoadError";
import { getDisplayWeeksFromPayload, getInitialWeekEntries } from "../lib/weekPayload";
import { readSessionClassDiffs, storeSessionClassDiffs } from "../lib/weekPersistence";
import { canNavigateToWeek, createWeekEntry, getAdjacentBatchStarts, getBatchOffsets, getBatchStart, getDerivedWeekTitle } from "../lib/weekPolicy";
import { rosterWeekReducer } from "../lib/weekReducer";
import { shiftIsoDateByDays } from "../lib/date";
import { MAX_WEEK_OFFSET } from "../../shared/weeks";
import type { Week, WeekBatch } from "../types/weeks";

interface UseWeeksOptions {
   enabled?: boolean;
   clearCache?: boolean;
   resetKey?: number | string;
}

const LOAD_ERROR_TOAST_MESSAGE = "Something went wrong while loading the roster.";
const FIRST_RETRY_DELAY_MS = 2_000;
const MAX_RETRY_DELAY_MS = 5 * 60 * 1000;
const PASSIVE_REFETCH_INTERVAL_MS = 5 * 60 * 1000;

interface BatchLoadOptions {
   force?: boolean;
   passive?: boolean;
}

interface BatchRequest {
   controller: AbortController;
   promise: Promise<void>;
}

function getNextRetryDelay(previousDelayMs: number) {
   if (previousDelayMs <= 0) {
      return FIRST_RETRY_DELAY_MS;
   }

   return Math.min(previousDelayMs * 2, MAX_RETRY_DELAY_MS);
}

export function useWeeks(offset: number, options: UseWeeksOptions = {}) {
   const enabled = options.enabled ?? true;
   const clearCache = options.clearCache ?? false;
   const resetKey = options.resetKey ?? 0;
   const [entries, dispatch] = useReducer(rosterWeekReducer, undefined, getInitialWeekEntries);
   const [now, setNow] = useState<number | null>(null);
   const [sessionLessonDiffs] = useState(readSessionClassDiffs);
   const entriesRef = useRef(entries);
   const requestsRef = useRef(new Map<string, BatchRequest>());
   const requestGenerationRef = useRef(0);
   const loadBatchRef = useRef<(startOffset: number, options?: BatchLoadOptions) => void>(() => undefined);
   const queuedRefetchesRef = useRef(new Set<number>());
   const retryTimersRef = useRef(new Map<string, number>());
   const latestRawWeeksRef = useRef(new Map<number, Week>());
   const hasShownLoadErrorToastRef = useRef(false);
   const activeOffsetRef = useRef(offset);
   const previousResetKeyRef = useRef(resetKey);

   const resetRuntime = useCallback(() => {
      requestGenerationRef.current += 1;
      entriesRef.current = {};
      requestsRef.current.forEach(({ controller }) => controller.abort());
      requestsRef.current.clear();
      queuedRefetchesRef.current.clear();
      latestRawWeeksRef.current.clear();
      hasShownLoadErrorToastRef.current = false;
      retryTimersRef.current.forEach((timerId) => window.clearTimeout(timerId));
      retryTimersRef.current.clear();
      sessionLessonDiffs.clear();
   }, [sessionLessonDiffs]);

   useEffect(() => {
      entriesRef.current = entries;
   }, [entries]);

   useEffect(() => {
      activeOffsetRef.current = offset;
   }, [offset]);

   useEffect(() => {
      const resetKeyChanged = previousResetKeyRef.current !== resetKey;
      previousResetKeyRef.current = resetKey;
      if (!clearCache && !resetKeyChanged) {
         return;
      }

      clearWeekBrowserCache();
      resetRuntime();

      const resetTimerId = window.setTimeout(() => dispatch({ type: "reset" }), 0);
      return () => window.clearTimeout(resetTimerId);
   }, [clearCache, resetKey, resetRuntime]);

   useEffect(() => {
      const retryTimers = retryTimersRef.current;
      const requests = requestsRef.current;
      return () => {
         retryTimers.forEach((timerId) => window.clearTimeout(timerId));
         retryTimers.clear();
         requests.forEach(({ controller }) => controller.abort());
         requests.clear();
      };
   }, []);

   useEffect(() => {
      if (!enabled) {
         return;
      }

      const loadBatch = (startOffset: number, options: BatchLoadOptions = {}) => {
         const force = options.force ?? false;
         const passive = options.passive ?? false;

         // OSIRIS serves no past weeks, so offset -1 (last week) is cache-only and is never fetched.
         if (startOffset < 0 || startOffset > MAX_WEEK_OFFSET) {
            return;
         }

         const offsets = getBatchOffsets(startOffset);
         const limit = offsets.length;
         const requestKey = `${startOffset}:${limit}`;

         if (requestsRef.current.has(requestKey)) {
            return;
         }

         const shouldFetch = offsets.some((targetOffset) => {
            const currentEntry = entriesRef.current[targetOffset];
            return force || !currentEntry?.data;
         });

         if (!shouldFetch) {
            return;
         }

         queuedRefetchesRef.current.delete(startOffset);
         const existingRetryTimer = retryTimersRef.current.get(requestKey);
         if (existingRetryTimer !== undefined) {
            window.clearTimeout(existingRetryTimer);
            retryTimersRef.current.delete(requestKey);
         }

         dispatch({ type: "fetch-started", offsets, force, passive });

         const controller = new AbortController();
         const generation = requestGenerationRef.current;
         const request = fetchWeeks(startOffset, limit, controller.signal)
            .then((payload) => {
               if (generation !== requestGenerationRef.current) {
                  return;
               }

               if (!isRosterTimeZoneKnown() || payload.timeZone !== getRosterTimeZone()) {
                  adoptRosterTimeZone(payload.timeZone);
                  return;
               }

               const incomingCurrentWeek = payload.weeks.find((week) => week.week.offset === 0);
               const previousCurrentWeek = latestRawWeeksRef.current.get(0) ?? entriesRef.current[0]?.data;
               if (incomingCurrentWeek && previousCurrentWeek && incomingCurrentWeek.week.start !== previousCurrentWeek.week.start) {
                  adoptCalendarRollover(previousCurrentWeek, payload);
                  return;
               }

               hasShownLoadErrorToastRef.current = false;
               const displayWeeks = getDisplayWeeksFromPayload(payload, entriesRef.current, latestRawWeeksRef.current, sessionLessonDiffs);
               dispatch({ type: "fetch-succeeded", weeks: displayWeeks });
            })
            .catch((error: unknown) => {
               if (controller.signal.aborted || generation !== requestGenerationRef.current) {
                  return;
               }

               const loadError = toWeekLoadError(error);
               const activeBatchAtFailure = getBatchStart(activeOffsetRef.current);
               const shouldNotify = !passive && startOffset === activeBatchAtFailure && !hasShownLoadErrorToastRef.current;
               if (shouldNotify) {
                  hasShownLoadErrorToastRef.current = true;
                  notifyError(LOAD_ERROR_TOAST_MESSAGE, LOAD_ERROR_TOAST_MESSAGE, true, error);
               }

               if (passive) {
                  dispatch({ type: "passive-fetch-failed", offsets, error: loadError });
                  return;
               }

               if (!loadError.retryable) {
                  dispatch({ type: "fetch-failed", offsets, error: loadError, force, retryAt: 0, retryDelayMs: 0 });
                  return;
               }

               const retryDelayMs = getNextRetryDelay(Math.max(...offsets.map((targetOffset) => entriesRef.current[targetOffset]?.retryDelayMs ?? 0)));
               const retryAt = Date.now() + retryDelayMs;
               dispatch({ type: "fetch-failed", offsets, error: loadError, force, retryAt, retryDelayMs });

               const timerId = window.setTimeout(() => {
                  retryTimersRef.current.delete(requestKey);
                  loadBatchRef.current(startOffset, { force: true });
               }, retryDelayMs);
               retryTimersRef.current.set(requestKey, timerId);
            })
            .finally(() => {
               const activeRequest = requestsRef.current.get(requestKey);
               if (activeRequest?.promise === request) {
                  requestsRef.current.delete(requestKey);
               }
            });

         requestsRef.current.set(requestKey, { controller, promise: request });
      };

      loadBatchRef.current = loadBatch;

      // A payload declaring a different zone than the one in memory (e.g. a deploy changed ROSTER_TIME_ZONE
      // mid-session) means every cached wall time was interpreted under the wrong zone: drop everything and refetch.
      const adoptRosterTimeZone = (timeZone: string) => {
         setRosterTimeZone(timeZone);
         clearWeekBrowserCache();
         resetRuntime();
         dispatch({ type: "reset" });
         loadBatchRef.current(getBatchStart(activeOffsetRef.current), { force: true });
      };

      const adoptCalendarRollover = (previousCurrentWeek: Week, payload: WeekBatch) => {
         resetRuntime();
         storeSessionClassDiffs(sessionLessonDiffs);

         const isConsecutiveWeek = shiftIsoDateByDays(previousCurrentWeek.week.start, 7) === payload.weeks.find((week) => week.week.offset === 0)?.week.start;
         const previousWeek = isConsecutiveWeek ? { ...previousCurrentWeek, week: { ...previousCurrentWeek.week, offset: -1 } } : null;
         const preservedEntries = previousWeek ? { [-1]: createWeekEntry(previousWeek) } : {};
         entriesRef.current = preservedEntries;

         const displayWeeks = getDisplayWeeksFromPayload(payload, preservedEntries, latestRawWeeksRef.current, sessionLessonDiffs);
         const replacementWeeks = previousWeek ? [previousWeek, ...displayWeeks] : displayWeeks;
         entriesRef.current = Object.fromEntries(replacementWeeks.map((week) => [week.week.offset, createWeekEntry(week)]));
         dispatch({ type: "replace-weeks", weeks: replacementWeeks });

         const activeBatchStart = getBatchStart(activeOffsetRef.current);
         if (!payload.weeks.some((week) => getBatchStart(week.week.offset) === activeBatchStart)) {
            loadBatchRef.current(activeBatchStart, { force: true });
         }
      };

      const activeEntry = entriesRef.current[offset];
      const activeBatchStart = getBatchStart(offset);
      const activeBatchQueued = queuedRefetchesRef.current.has(activeBatchStart);
      loadBatch(activeBatchStart, { force: activeBatchQueued || (activeBatchStart === 0 && Boolean(activeEntry?.isHydrated)) });

      getAdjacentBatchStarts(activeBatchStart)
         .filter((prefetchBatchStart) => prefetchBatchStart > activeBatchStart)
         .forEach((prefetchBatchStart) => {
            loadBatch(prefetchBatchStart, { force: queuedRefetchesRef.current.has(prefetchBatchStart) });
         });
   }, [enabled, offset, resetKey, resetRuntime, sessionLessonDiffs]);

   useEffect(() => {
      if (!enabled) {
         return;
      }

      const refetchPassiveBatches = () => {
         const activeBatchStart = getBatchStart(offset);
         const passiveBatchStarts = new Set([getBatchStart(0), activeBatchStart]);

         Object.keys(entriesRef.current).forEach((entryOffset) => {
            const parsedOffset = Number(entryOffset);
            const entry = entriesRef.current[parsedOffset];
            if (entry?.data) {
               queuedRefetchesRef.current.add(getBatchStart(parsedOffset));
            }
         });

         passiveBatchStarts.forEach((batchStart) => {
            if (batchStart < 0 || batchStart > MAX_WEEK_OFFSET) {
               return;
            }

            loadBatchRef.current(batchStart, { force: true, passive: true });
         });
      };

      const intervalId = window.setInterval(refetchPassiveBatches, PASSIVE_REFETCH_INTERVAL_MS);
      const refreshWhenActive = () => {
         if (document.visibilityState !== "visible") {
            return;
         }
         const batchStarts = new Set([getBatchStart(0), getBatchStart(activeOffsetRef.current)]);
         batchStarts.forEach((batchStart) => loadBatchRef.current(batchStart, { force: true, passive: true }));
      };
      document.addEventListener("visibilitychange", refreshWhenActive);
      window.addEventListener("online", refreshWhenActive);
      return () => {
         window.clearInterval(intervalId);
         document.removeEventListener("visibilitychange", refreshWhenActive);
         window.removeEventListener("online", refreshWhenActive);
      };
   }, [enabled, offset, sessionLessonDiffs]);

   const refresh = useCallback(() => {
      loadBatchRef.current(getBatchStart(activeOffsetRef.current), { force: true });
   }, []);

   const activeEntry = entries[offset];
   const activeRetryAt = activeEntry?.retryAt ?? 0;

   useEffect(() => {
      if (activeRetryAt <= Date.now()) {
         const resetTimerId = window.setTimeout(() => setNow(null), 0);
         return () => window.clearTimeout(resetTimerId);
      }

      const updateNow = () => setNow(Date.now());
      updateNow();
      const intervalId = window.setInterval(updateNow, 1_000);
      return () => window.clearInterval(intervalId);
   }, [activeRetryAt]);

   const shouldSuppressCachedData = clearCache;
   const data = shouldSuppressCachedData ? null : (activeEntry?.data ?? null);
   const error = shouldSuppressCachedData ? null : (activeEntry?.error ?? null);
   const loading = enabled && !data && !error && (activeEntry?.isFetching ?? true);
   const refreshing = Boolean(data && activeEntry?.isFetching);
   const retrying = Boolean(!data && activeEntry?.isFetching && error);
   const retryCountdownMs = now === null ? 0 : Math.max(0, (activeEntry?.retryAt ?? 0) - now);
   const title = useMemo(
      () => (shouldSuppressCachedData ? "Loading week..." : getDerivedWeekTitle(offset, entries)),
      [entries, offset, shouldSuppressCachedData]
   );
   const isWeekNavigable = useCallback(
      (targetOffset: number) => !shouldSuppressCachedData && canNavigateToWeek(targetOffset, entries),
      [entries, shouldSuppressCachedData]
   );
   const canGoPrevious = isWeekNavigable(offset - 1);
   const canGoNext = isWeekNavigable(offset + 1);
   const initialWeeks = Array.from({ length: 5 }, (_, weekOffset) => entries[weekOffset]?.data).filter(
      (week): week is Week => week !== null && week !== undefined
   );
   const areInitialWeeksLoaded = initialWeeks.length === 5;

   return {
      areInitialWeeksLoaded,
      canGoPrevious,
      canGoNext,
      data,
      error,
      isWeekNavigable,
      initialWeeks,
      loading,
      retryCountdownMs,
      retrying,
      refreshing,
      refresh,
      title,
   };
}
