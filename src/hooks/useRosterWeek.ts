import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchRosterWeeks } from "../api/roster";
import { formatWeekTitle, getIsoWeekNumber, getLocalWeekStartIso, shiftIsoDateByDays } from "../lib/date";
import { notifyError } from "../lib/notyf";
import { clearRosterBrowserCache, CURRENT_WEEK_CACHE_KEY, LAST_WEEK_CACHE_KEY, SESSION_LESSON_DIFFS_KEY } from "../lib/rosterCache";
import { toRosterLoadError, type RosterLoadError } from "../lib/rosterLoadError";
import { notifyRosterDiffs } from "../lib/rosterNotifications";
import { applySessionLessonDiffs, recordSessionLessonDiffs, type SessionLessonDiff, type SessionLessonDiffsByWeek } from "../lib/rosterSessionDiffs";
import { MAX_WEEK_OFFSET, MIN_WEEK_OFFSET } from "../../shared/rosterTime";
import type { RosterBatchResponse, RosterResponse } from "../types/roster";

interface WeekEntry {
   data: RosterResponse | null;
   error: RosterLoadError | null;
   isFetching: boolean;
   isHydrated: boolean;
   retryAt: number;
   retryDelayMs: number;
   updatedAt: number;
}

interface CachedCurrentWeek {
   data: RosterResponse;
   weekNumber: number;
   weekStart?: string;
}

interface CachedRosterWeek {
   data: RosterResponse;
   weekNumber: number;
   weekStart?: string;
}

type WeekEntries = Partial<Record<number, WeekEntry>>;

interface UseRosterWeekOptions {
   enabled?: boolean;
   clearCache?: boolean;
   resetKey?: number;
}

const LOAD_ERROR_TOAST_MESSAGE = "Something went wrong while loading the roster.";
const FIRST_RETRY_DELAY_MS = 2_000;
const MAX_RETRY_DELAY_MS = 5 * 60 * 1000;
const BATCH_SIZE = 5;
const PASSIVE_REFETCH_INTERVAL_MS = 5 * 60 * 1000;

interface BatchLoadOptions {
   force?: boolean;
   passive?: boolean;
}

interface BatchRequest {
   controller: AbortController;
   promise: Promise<void>;
}

function createEntry(data: RosterResponse | null, overrides?: Partial<WeekEntry>): WeekEntry {
   return {
      data,
      error: null,
      isFetching: false,
      isHydrated: false,
      retryAt: 0,
      retryDelayMs: 0,
      updatedAt: data ? Date.now() : 0,
      ...overrides,
   };
}

function getNextRetryDelay(previousDelayMs: number) {
   if (previousDelayMs <= 0) {
      return FIRST_RETRY_DELAY_MS;
   }

   return Math.min(previousDelayMs * 2, MAX_RETRY_DELAY_MS);
}

function getRosterReferenceDate() {
   const date = new Date();
   const day = date.getDay();

   if (day === 6) {
      date.setDate(date.getDate() + 2);
   } else if (day === 0) {
      date.setDate(date.getDate() + 1);
   }

   return date;
}

function getCurrentWeekNumber() {
   return getIsoWeekNumber(getRosterReferenceDate().toISOString());
}

function getCurrentWeekStartIso() {
   return getLocalWeekStartIso(getRosterReferenceDate());
}

function getLastWeekStartIso() {
   const date = getRosterReferenceDate();
   date.setDate(date.getDate() - 7);
   return getLocalWeekStartIso(date);
}

function normalizeCachedWeek(data: RosterResponse, offset: number, note?: string): RosterResponse {
   return {
      ...data,
      week: {
         ...data.week,
         offset,
      },
      source: note
         ? {
              ...data.source,
              note,
           }
         : data.source,
   };
}

function parseCachedRosterWeek(cacheKey: string) {
   const cached = window.localStorage.getItem(cacheKey);
   if (!cached) {
      return null;
   }

   const parsed = JSON.parse(cached) as CachedRosterWeek | RosterResponse;
   const data = "data" in parsed ? parsed.data : parsed;
   const weekNumber = "weekNumber" in parsed ? parsed.weekNumber : data.week.number;
   const weekStart = "weekStart" in parsed ? parsed.weekStart : data.week.start;
   return { data, weekNumber, weekStart };
}

function readCachedCurrentWeek() {
   if (typeof window === "undefined") {
      return null;
   }

   try {
      const cached = parseCachedRosterWeek(CURRENT_WEEK_CACHE_KEY);
      if (!cached) {
         return null;
      }

      const { data, weekNumber, weekStart } = cached;

      if (weekNumber !== getCurrentWeekNumber() || weekStart !== getCurrentWeekStartIso()) {
         window.localStorage.removeItem(CURRENT_WEEK_CACHE_KEY);
         return null;
      }

      return normalizeCachedWeek(data, 0);
   } catch (error) {
      notifyError(error, "Failed to parse cached current week.");
      return null;
   }
}

function readCachedLastWeek() {
   if (typeof window === "undefined") {
      return null;
   }

   const lastWeekStart = getLastWeekStartIso();

   try {
      const cachedLastWeek = parseCachedRosterWeek(LAST_WEEK_CACHE_KEY);
      if (cachedLastWeek?.weekStart === lastWeekStart) {
         return normalizeCachedWeek(cachedLastWeek.data, -1, "Using locally cached OSIRIS roster data from last week.");
      }

      if (cachedLastWeek) {
         window.localStorage.removeItem(LAST_WEEK_CACHE_KEY);
      }

      const cachedCurrentWeek = parseCachedRosterWeek(CURRENT_WEEK_CACHE_KEY);
      if (cachedCurrentWeek?.weekStart === lastWeekStart) {
         const lastWeek = normalizeCachedWeek(cachedCurrentWeek.data, -1, "Using locally cached OSIRIS roster data from last week.");
         storeCachedLastWeek(lastWeek);
         window.localStorage.removeItem(CURRENT_WEEK_CACHE_KEY);
         return lastWeek;
      }

      return null;
   } catch (error) {
      notifyError(error, "Failed to parse cached last week.");
      return null;
   }
}

function storeCachedLastWeek(data: RosterResponse) {
   if (typeof window === "undefined") {
      return;
   }

   window.localStorage.setItem(
      LAST_WEEK_CACHE_KEY,
      JSON.stringify({
         data: normalizeCachedWeek(data, -1),
         weekNumber: data.week.number,
         weekStart: data.week.start,
      } satisfies CachedRosterWeek)
   );
}

function storeCachedCurrentWeek(data: RosterResponse) {
   if (typeof window === "undefined" || data.week.offset !== 0) {
      return;
   }

   try {
      const cachedCurrentWeek = parseCachedRosterWeek(CURRENT_WEEK_CACHE_KEY);
      if (cachedCurrentWeek?.weekStart === getLastWeekStartIso()) {
         storeCachedLastWeek(cachedCurrentWeek.data);
      }
   } catch (error) {
      notifyError(error, "Failed to update cached last week.");
   }

   window.localStorage.setItem(
      CURRENT_WEEK_CACHE_KEY,
      JSON.stringify({
         data,
         weekNumber: data.week.number,
         weekStart: data.week.start,
      } satisfies CachedCurrentWeek)
   );
}

function readSessionLessonDiffs(): SessionLessonDiffsByWeek {
   if (typeof window === "undefined") {
      return new Map();
   }

   try {
      const stored = window.sessionStorage.getItem(SESSION_LESSON_DIFFS_KEY);
      if (!stored) {
         return new Map();
      }

      const parsed = JSON.parse(stored) as Record<string, SessionLessonDiff[]>;
      return new Map(Object.entries(parsed).map(([weekOffset, diffs]) => [Number(weekOffset), new Map(diffs.map((diff) => [diff.lesson.id, diff]))]));
   } catch (error) {
      notifyError(error, "Failed to parse session roster changes.");
      return new Map();
   }
}

function storeSessionLessonDiffs(weekDiffs: SessionLessonDiffsByWeek) {
   if (typeof window === "undefined") {
      return;
   }

   const serialized = Object.fromEntries(
      [...weekDiffs.entries()].filter(([, diffs]) => diffs.size > 0).map(([weekOffset, diffs]) => [String(weekOffset), [...diffs.values()]])
   );

   window.sessionStorage.setItem(SESSION_LESSON_DIFFS_KEY, JSON.stringify(serialized));
}

function getInitialEntries(): WeekEntries {
   const cachedLastWeek = readCachedLastWeek();
   const cachedCurrentWeek = readCachedCurrentWeek();
   const entries: WeekEntries = {};

   if (cachedLastWeek) {
      entries[-1] = createEntry(cachedLastWeek, {
         isHydrated: true,
      });
   }

   if (cachedCurrentWeek) {
      entries[0] = createEntry(cachedCurrentWeek, {
         isHydrated: true,
      });
   }

   return entries;
}

function getDerivedTitle(offset: number, entries: WeekEntries) {
   const activeEntry = entries[offset];
   if (activeEntry?.data) {
      const { start, end, number } = activeEntry.data.week;
      return formatWeekTitle(start, end, number);
   }

   const closestEntry = Object.keys(entries)
      .map((entryOffset) => ({
         offset: Number(entryOffset),
         entry: entries[Number(entryOffset)],
      }))
      .filter((entry): entry is { offset: number; entry: WeekEntry } => Boolean(entry.entry?.data))
      .sort((left, right) => Math.abs(left.offset - offset) - Math.abs(right.offset - offset))[0];

   const closestData = closestEntry?.entry.data ?? null;
   const closestOffset = closestEntry?.offset;
   if (!closestData || closestOffset === undefined) {
      return "Loading week...";
   }

   const offsetDelta = offset - closestOffset;
   const { start, end } = closestData.week;
   const derivedStart = shiftIsoDateByDays(start, offsetDelta * 7);
   const derivedEnd = shiftIsoDateByDays(end, offsetDelta * 7);
   return formatWeekTitle(derivedStart, derivedEnd, getIsoWeekNumber(derivedStart));
}

function getBatchStart(targetOffset: number) {
   if (targetOffset < 0) {
      return MIN_WEEK_OFFSET;
   }

   return Math.max(MIN_WEEK_OFFSET, Math.floor(targetOffset / BATCH_SIZE) * BATCH_SIZE);
}

function getBatchOffsets(startOffset: number) {
   if (startOffset < 0) {
      return [MIN_WEEK_OFFSET];
   }

   const endOffset = Math.min(startOffset + BATCH_SIZE - 1, MAX_WEEK_OFFSET);
   return Array.from({ length: endOffset - startOffset + 1 }, (_, index) => startOffset + index);
}

function getAdjacentBatchStarts(startOffset: number) {
   const previous = startOffset === 0 ? MIN_WEEK_OFFSET : startOffset > 0 ? Math.max(MIN_WEEK_OFFSET, startOffset - BATCH_SIZE) : null;
   const next = startOffset < 0 ? 0 : startOffset + BATCH_SIZE;

   return [previous, next].filter((batchStart): batchStart is number => batchStart !== null && batchStart >= MIN_WEEK_OFFSET && batchStart <= MAX_WEEK_OFFSET);
}

function canNavigateToWeek(offset: number, entries: WeekEntries) {
   if (offset < MIN_WEEK_OFFSET || offset > MAX_WEEK_OFFSET) {
      return false;
   }

   const entry = entries[offset];
   if (offset < 0) {
      return Boolean(entry?.data);
   }

   return !(entry?.error && !entry.data);
}

function isSameRosterData(left: RosterResponse | null | undefined, right: RosterResponse) {
   if (!left) {
      return false;
   }

   if (
      left.week.offset !== right.week.offset ||
      left.week.number !== right.week.number ||
      left.week.start !== right.week.start ||
      left.week.end !== right.week.end ||
      left.lessons.length !== right.lessons.length
   ) {
      return false;
   }

   return left.lessons.every((lesson, index) => {
      const nextLesson = right.lessons[index];
      if (!nextLesson) {
         return false;
      }

      return (
         lesson.id === nextLesson.id &&
         lesson.title === nextLesson.title &&
         lesson.subject === nextLesson.subject &&
         lesson.start === nextLesson.start &&
         lesson.end === nextLesson.end &&
         lesson.teacher === nextLesson.teacher &&
         lesson.room === nextLesson.room &&
         lesson.location === nextLesson.location &&
         lesson.description === nextLesson.description &&
         lesson.status === nextLesson.status
      );
   });
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
   const [entries, setEntries] = useState<WeekEntries>(getInitialEntries);
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

      const resetTimerId = window.setTimeout(() => setEntries({}), 0);
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

         setEntries((current) => {
            const next = { ...current };
            offsets.forEach((targetOffset) => {
               const currentEntry = current[targetOffset];
               if (passive && !currentEntry?.data) {
                  return;
               }

               if (force || !currentEntry?.data) {
                  next[targetOffset] = createEntry(currentEntry?.data ?? null, {
                     error: currentEntry?.data ? null : (currentEntry?.error ?? null),
                     isFetching: true,
                     isHydrated: force ? false : (currentEntry?.isHydrated ?? false),
                     retryAt: 0,
                     retryDelayMs: currentEntry?.retryDelayMs ?? 0,
                     updatedAt: currentEntry?.updatedAt ?? 0,
                  });
               }
            });
            return next;
         });

         const controller = new AbortController();
         const generation = requestGenerationRef.current;
         const request = fetchRosterWeeks(startOffset, limit, controller.signal)
            .then((payload) => {
               if (generation !== requestGenerationRef.current) {
                  return;
               }

               hasShownLoadErrorToastRef.current = false;
               const displayWeeks = getDisplayWeeksFromPayload(payload, entriesRef.current, latestRawWeeksRef.current, sessionLessonDiffs);
               setEntries((current) => {
                  const next = { ...current };
                  displayWeeks.forEach((weekData) => {
                     const currentEntry = current[weekData.week.offset];
                     if (isSameRosterData(currentEntry?.data, weekData)) {
                        next[weekData.week.offset] = createEntry(currentEntry?.data ?? weekData, {
                           error: null,
                           retryAt: 0,
                           retryDelayMs: 0,
                           isFetching: false,
                           isHydrated: false,
                           updatedAt: currentEntry?.updatedAt ?? Date.now(),
                        });
                        return;
                     }

                     next[weekData.week.offset] = createEntry(weekData);
                  });
                  return next;
               });
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
                  setEntries((current) => {
                     const next = { ...current };
                     offsets.forEach((targetOffset) => {
                        const currentEntry = current[targetOffset];
                        if (currentEntry?.data) {
                           next[targetOffset] = createEntry(currentEntry.data, {
                              error: loadError,
                              isFetching: false,
                              updatedAt: currentEntry.updatedAt,
                           });
                        }
                     });
                     return next;
                  });
                  return;
               }

               const retryDelayMs = getNextRetryDelay(Math.max(...offsets.map((targetOffset) => entriesRef.current[targetOffset]?.retryDelayMs ?? 0)));
               const retryAt = Date.now() + retryDelayMs;
               setEntries((current) => {
                  const next = { ...current };
                  offsets.forEach((targetOffset) => {
                     const currentEntry = current[targetOffset];
                     let existingData: RosterResponse | null = null;
                     let updatedAt = 0;

                     if (currentEntry) {
                        existingData = currentEntry.data;
                        updatedAt = currentEntry.updatedAt;
                     }

                     let shouldUpdate = force;

                     if (!shouldUpdate) {
                        if (!currentEntry) {
                           shouldUpdate = true;
                        } else if (!currentEntry.data) {
                           shouldUpdate = true;
                        } else if (currentEntry.isFetching) {
                           shouldUpdate = true;
                        }
                     }

                     if (shouldUpdate) {
                        next[targetOffset] = createEntry(existingData, {
                           error: loadError,
                           isFetching: false,
                           isHydrated: false,
                           retryAt,
                           retryDelayMs,
                           updatedAt,
                        });
                     }
                  });
                  return next;
               });

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
   const title = useMemo(() => (shouldSuppressCachedData ? "Loading week..." : getDerivedTitle(offset, entries)), [entries, offset, shouldSuppressCachedData]);
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
