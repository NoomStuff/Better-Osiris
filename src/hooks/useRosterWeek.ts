import { useEffect, useMemo, useRef, useState } from "react";
import { fetchRosterWeeks } from "../api/roster";
import { formatWeekTitle, getIsoWeekNumber, shiftIsoDateByDays } from "../lib/date";
import { notifyError } from "../lib/notyf";
import type { RosterResponse } from "../types/roster";

interface WeekEntry {
   data: RosterResponse | null;
   error: string;
   isFetching: boolean;
   isHydrated: boolean;
   updatedAt: number;
}

interface CachedCurrentWeek {
   data: RosterResponse;
   weekNumber: number;
}

type WeekEntries = Partial<Record<number, WeekEntry>>;

const CURRENT_WEEK_CACHE_KEY = "roster-current-week-cache-v2";
const LOAD_ERROR_MESSAGE = "Something went wrong while loading the roster.";
const BATCH_SIZE = 5;
const PREFETCH_BATCHES = [-1, 1];
const MIN_WEEK_OFFSET = 0;
const MAX_WEEK_OFFSET = 50;
const PASSIVE_REFETCH_INTERVAL_MS = 5 * 60 * 1000;

function createEntry(data: RosterResponse | null, overrides?: Partial<WeekEntry>): WeekEntry {
   return {
      data,
      error: "",
      isFetching: false,
      isHydrated: false,
      updatedAt: data ? Date.now() : 0,
      ...overrides,
   };
}

function getCurrentWeekNumber() {
   const date = new Date();
   const day = date.getDay();

   if (day === 6) {
      date.setDate(date.getDate() + 2);
   } else if (day === 0) {
      date.setDate(date.getDate() + 1);
   }

   return getIsoWeekNumber(date.toISOString());
}

function readCachedCurrentWeek() {
   if (typeof window === "undefined") {
      return null;
   }

   try {
      const cached = window.localStorage.getItem(CURRENT_WEEK_CACHE_KEY);
      if (!cached) {
         return null;
      }

      const parsed = JSON.parse(cached) as CachedCurrentWeek | RosterResponse;
      const data = "data" in parsed ? parsed.data : parsed;
      const weekNumber = "weekNumber" in parsed ? parsed.weekNumber : data.week.number;

      if (weekNumber !== getCurrentWeekNumber()) {
         window.localStorage.removeItem(CURRENT_WEEK_CACHE_KEY);
         return null;
      }

      return data;
   } catch (error) {
      notifyError(error, "Failed to parse cached current week.");
      return null;
   }
}

function storeCachedCurrentWeek(data: RosterResponse) {
   if (typeof window === "undefined" || data.week.offset !== 0) {
      return;
   }

   window.localStorage.setItem(
      CURRENT_WEEK_CACHE_KEY,
      JSON.stringify({
         data,
         weekNumber: data.week.number,
      } satisfies CachedCurrentWeek)
   );
}

function getInitialEntries(): WeekEntries {
   const cachedCurrentWeek = readCachedCurrentWeek();
   if (!cachedCurrentWeek) {
      return {};
   }

   return {
      0: createEntry(cachedCurrentWeek, {
         isHydrated: true,
      }),
   };
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
   return Math.floor(targetOffset / BATCH_SIZE) * BATCH_SIZE;
}

function getBatchOffsets(startOffset: number) {
   const endOffset = Math.min(startOffset + BATCH_SIZE - 1, MAX_WEEK_OFFSET);
   return Array.from({ length: endOffset - startOffset + 1 }, (_, index) => startOffset + index);
}

function getBatchRequestKey(startOffset: number) {
   return `${startOffset}:${getBatchOffsets(startOffset).length}`;
}

function isSameRosterData(left: RosterResponse | null | undefined, right: RosterResponse) {
   return Boolean(left) && JSON.stringify(left) === JSON.stringify(right);
}

export function useRosterWeek(offset: number) {
   const [entries, setEntries] = useState<WeekEntries>(getInitialEntries);
   const entriesRef = useRef(entries);
   const requestsRef = useRef(new Map<string, Promise<void>>());
   const queuedRefetchesRef = useRef(new Set<number>());

   useEffect(() => {
      entriesRef.current = entries;
   }, [entries]);

   useEffect(() => {
      const loadBatch = (startOffset: number, force = false) => {
         if (startOffset < MIN_WEEK_OFFSET || startOffset > MAX_WEEK_OFFSET) {
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

         setEntries((current) => {
            const next = { ...current };
            offsets.forEach((targetOffset) => {
               const currentEntry = current[targetOffset];
               if (force || !currentEntry?.data) {
                  next[targetOffset] = createEntry(currentEntry?.data ?? null, {
                     error: "",
                     isFetching: true,
                     isHydrated: force ? false : (currentEntry?.isHydrated ?? false),
                     updatedAt: currentEntry?.updatedAt ?? 0,
                  });
               }
            });
            return next;
         });

         const request = fetchRosterWeeks(startOffset, limit)
            .then((payload) => {
               setEntries((current) => {
                  const next = { ...current };
                  payload.weeks.forEach((weekData) => {
                     const currentEntry = current[weekData.week.offset];
                     if (isSameRosterData(currentEntry?.data, weekData)) {
                        next[weekData.week.offset] = createEntry(currentEntry?.data ?? weekData, {
                           error: "",
                           isFetching: false,
                           isHydrated: false,
                           updatedAt: currentEntry?.updatedAt ?? Date.now(),
                        });
                        return;
                     }

                     if (weekData.week.offset === 0) {
                        storeCachedCurrentWeek(weekData);
                     }
                     next[weekData.week.offset] = createEntry(weekData);
                  });
                  return next;
               });
            })
            .catch((error: unknown) => {
               notifyError(error, LOAD_ERROR_MESSAGE);
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
                           error: LOAD_ERROR_MESSAGE,
                           isFetching: false,
                           isHydrated: false,
                           updatedAt,
                        });
                     }
                  });
                  return next;
               });
            })
            .finally(() => {
               requestsRef.current.delete(requestKey);
            });

         requestsRef.current.set(requestKey, request);
      };

      const activeEntry = entriesRef.current[offset];
      const activeBatchStart = getBatchStart(offset);
      const activeBatchQueued = queuedRefetchesRef.current.has(activeBatchStart);
      loadBatch(activeBatchStart, activeBatchQueued || (activeBatchStart === 0 && Boolean(activeEntry?.isHydrated)));

      PREFETCH_BATCHES.forEach((delta) => {
         const prefetchBatchStart = activeBatchStart + delta * BATCH_SIZE;
         loadBatch(prefetchBatchStart, queuedRefetchesRef.current.has(prefetchBatchStart));
      });
   }, [offset]);

   useEffect(() => {
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

            queuedRefetchesRef.current.delete(batchStart);
            const offsets = getBatchOffsets(batchStart);
            const requestKey = getBatchRequestKey(batchStart);
            if (requestsRef.current.has(requestKey)) {
               return;
            }

            setEntries((current) => {
               const next = { ...current };
               offsets.forEach((targetOffset) => {
                  const currentEntry = current[targetOffset];
                  if (!currentEntry?.data) {
                     return;
                  }

                  next[targetOffset] = createEntry(currentEntry.data, {
                     error: "",
                     isFetching: true,
                     isHydrated: false,
                     updatedAt: currentEntry.updatedAt,
                  });
               });
               return next;
            });

            const request = fetchRosterWeeks(batchStart, offsets.length)
               .then((payload) => {
                  setEntries((current) => {
                     const next = { ...current };
                     payload.weeks.forEach((weekData) => {
                        const currentEntry = current[weekData.week.offset];
                        if (isSameRosterData(currentEntry?.data, weekData)) {
                           next[weekData.week.offset] = createEntry(currentEntry?.data ?? weekData, {
                              error: "",
                              isFetching: false,
                              isHydrated: false,
                              updatedAt: currentEntry?.updatedAt ?? Date.now(),
                           });
                           return;
                        }

                        if (weekData.week.offset === 0) {
                           storeCachedCurrentWeek(weekData);
                        }
                        next[weekData.week.offset] = createEntry(weekData);
                     });
                     return next;
                  });
               })
               .catch((error: unknown) => {
                  notifyError(error, LOAD_ERROR_MESSAGE);
                  setEntries((current) => {
                     const next = { ...current };
                     offsets.forEach((targetOffset) => {
                        const currentEntry = current[targetOffset];
                        if (!currentEntry?.data) {
                           return;
                        }

                        next[targetOffset] = createEntry(currentEntry.data, {
                           error: LOAD_ERROR_MESSAGE,
                           isFetching: false,
                           isHydrated: false,
                           updatedAt: currentEntry.updatedAt,
                        });
                     });
                     return next;
                  });
               })
               .finally(() => {
                  requestsRef.current.delete(requestKey);
               });

            requestsRef.current.set(requestKey, request);
         });
      };

      const intervalId = window.setInterval(refetchPassiveBatches, PASSIVE_REFETCH_INTERVAL_MS);
      return () => window.clearInterval(intervalId);
   }, [offset]);

   const activeEntry = entries[offset];
   const data = activeEntry?.data ?? null;
   const loading = !data && (activeEntry?.isFetching ?? true);
   const refreshing = Boolean(data && activeEntry?.isFetching);
   const error = activeEntry?.error ?? "";
   const title = useMemo(() => getDerivedTitle(offset, entries), [entries, offset]);

   return {
      data,
      error,
      loading,
      refreshing,
      title,
   };
}
