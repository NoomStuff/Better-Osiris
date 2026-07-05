import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { fetchRosterWeeks } from "../api/roster";
import { notifyError } from "../lib/notyf";
import { clearRosterBrowserCache } from "../lib/rosterCache";
import { toRosterLoadError } from "../lib/rosterLoadError";
import { notifyRosterDiffs } from "../lib/rosterNotifications";
import { readCachedCurrentWeek, readCachedLastWeek, readSessionLessonDiffs, storeCachedCurrentWeek, storeSessionLessonDiffs } from "../lib/rosterPersistence";
import { applySessionLessonDiffs, recordSessionLessonDiffs, type SessionLessonDiff, type SessionLessonDiffsByWeek } from "../lib/rosterSessionDiffs";
import {
   canNavigateToWeek,
   createWeekEntry,
   getAdjacentBatchStarts,
   getBatchOffsets,
   getBatchStart,
   getDerivedWeekTitle,
   isSameRosterData,
   type WeekEntries,
} from "../lib/rosterWeekPolicy";
import { rosterWeekReducer } from "../lib/rosterWeekReducer";
import { MAX_WEEK_OFFSET, MIN_WEEK_OFFSET } from "../../shared/roster";
import type { RosterBatchResponse, RosterResponse } from "../types/roster";

interface UseRosterWeekOptions {
   enabled?: boolean;
   clearCache?: boolean;
   resetKey?: number;
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

function getInitialEntries(): WeekEntries {
   const cachedLastWeek = readCachedLastWeek();
   const cachedCurrentWeek = readCachedCurrentWeek();
   const entries: WeekEntries = {};

   if (cachedLastWeek) {
      entries[-1] = createWeekEntry(cachedLastWeek, {
         isHydrated: true,
      });
   }

   if (cachedCurrentWeek) {
      entries[0] = createWeekEntry(cachedCurrentWeek, {
         isHydrated: true,
      });
   }

   return entries;
}

function getDisplayWeeksFromPayload(
   payload: RosterBatchResponse,
   entries: WeekEntries,
   latestRawWeeks: Map<number, RosterResponse>,
   sessionLessonDiffs: SessionLessonDiffsByWeek
) {
   let recordedNewDiff = false;
   const currentWeekDiffs: SessionLessonDiff[] = [];
   const weeks: RosterResponse[] = [];

   for (const weekData of payload.weeks) {
      const comparisonBase = latestRawWeeks.get(weekData.week.offset) ?? entries[weekData.week.offset]?.data ?? null;
      if (comparisonBase && !isSameRosterData(comparisonBase, weekData)) {
         const recordedDiffs = recordSessionLessonDiffs(comparisonBase, weekData, sessionLessonDiffs);
         if (recordedDiffs.length > 0) {
            recordedNewDiff = true;
            if (weekData.week.offset === 0) {
               currentWeekDiffs.push(...recordedDiffs);
            }
         }
      }

      latestRawWeeks.set(weekData.week.offset, weekData);
      if (weekData.week.offset === 0) {
         storeCachedCurrentWeek(weekData);
      }

      weeks.push(applySessionLessonDiffs(weekData, sessionLessonDiffs));
   }

   if (recordedNewDiff) {
      storeSessionLessonDiffs(sessionLessonDiffs);
   }
   notifyRosterDiffs(currentWeekDiffs);

   return weeks;
}

export function useRosterWeek(offset: number, options: UseRosterWeekOptions = {}) {
   const enabled = options.enabled ?? true;
   const clearCache = options.clearCache ?? false;
   const resetKey = options.resetKey ?? 0;
   const [entries, dispatch] = useReducer(rosterWeekReducer, undefined, getInitialEntries);
   const [now, setNow] = useState<number | null>(null);
   const [sessionLessonDiffs] = useState(readSessionLessonDiffs);
   const entriesRef = useRef(entries);
   const requestsRef = useRef(new Map<string, BatchRequest>());
   const requestGenerationRef = useRef(0);
   const loadBatchRef = useRef<(startOffset: number, options?: BatchLoadOptions) => void>(() => undefined);
   const queuedRefetchesRef = useRef(new Set<number>());
   const retryTimersRef = useRef(new Map<string, number>());
   const latestRawWeeksRef = useRef(new Map<number, RosterResponse>());
   const hasShownLoadErrorToastRef = useRef(false);
   const activeOffsetRef = useRef(offset);
   const previousResetKeyRef = useRef(resetKey);

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

      clearRosterBrowserCache();
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

      const resetTimerId = window.setTimeout(() => dispatch({ type: "reset" }), 0);
      return () => window.clearTimeout(resetTimerId);
   }, [clearCache, resetKey, sessionLessonDiffs]);

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

         if (startOffset < MIN_WEEK_OFFSET || startOffset > MAX_WEEK_OFFSET) {
            return;
         }

         if (startOffset < 0) {
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
         const request = fetchRosterWeeks(startOffset, limit, controller.signal)
            .then((payload) => {
               if (generation !== requestGenerationRef.current) {
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

               const loadError = toRosterLoadError(error);
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
      const activeEntry = entriesRef.current[offset];
      const activeBatchStart = getBatchStart(offset);
      const activeBatchQueued = queuedRefetchesRef.current.has(activeBatchStart);
      loadBatch(activeBatchStart, { force: activeBatchQueued || (activeBatchStart === 0 && Boolean(activeEntry?.isHydrated)) });

      getAdjacentBatchStarts(activeBatchStart).forEach((prefetchBatchStart) => {
         loadBatch(prefetchBatchStart, { force: queuedRefetchesRef.current.has(prefetchBatchStart) });
      });
   }, [enabled, offset, resetKey, sessionLessonDiffs]);

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
            if (batchStart < MIN_WEEK_OFFSET || batchStart > MAX_WEEK_OFFSET) {
               return;
            }

            if (batchStart < 0) {
               return;
            }

            loadBatchRef.current(batchStart, { force: true, passive: true });
         });
      };

      const intervalId = window.setInterval(refetchPassiveBatches, PASSIVE_REFETCH_INTERVAL_MS);
      return () => window.clearInterval(intervalId);
   }, [enabled, offset, sessionLessonDiffs]);

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

   return {
      canGoPrevious,
      canGoNext,
      data,
      error,
      isWeekNavigable,
      loading,
      retryCountdownMs,
      retrying,
      refreshing,
      title,
   };
}
