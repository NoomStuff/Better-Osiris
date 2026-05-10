import { useEffect, useMemo, useRef, useState } from "react";
import { fetchRosterWeeks } from "../api/roster";
import { formatWeekTitle, getIsoWeekNumber, shiftIsoDateByDays } from "../lib/date";
import { logError } from "../lib/notify";
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
      logError(error, "Failed to parse cached current week.");
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
      } satisfies CachedCurrentWeek),
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

export function useRosterWeek(offset: number) {
   const [entries, setEntries] = useState<WeekEntries>(getInitialEntries);
   const entriesRef = useRef(entries);
   const requestsRef = useRef(new Map<string, Promise<void>>());

   useEffect(() => {
      entriesRef.current = entries;
   }, [entries]);

   useEffect(() => {
      const getBatchStart = (targetOffset: number) => Math.floor(targetOffset / BATCH_SIZE) * BATCH_SIZE;

      const loadBatch = (startOffset: number, force = false) => {
         if (startOffset < MIN_WEEK_OFFSET || startOffset > MAX_WEEK_OFFSET) {
            return;
         }

         const endOffset = Math.min(startOffset + BATCH_SIZE - 1, MAX_WEEK_OFFSET);
         const limit = endOffset - startOffset + 1;
         const requestKey = `${startOffset}:${limit}`;
         const offsets = Array.from({ length: limit }, (_, index) => startOffset + index);

         if (!force && requestsRef.current.has(requestKey)) {
            return;
         }

         const shouldFetch = offsets.some((targetOffset) => {
            const currentEntry = entriesRef.current[targetOffset];
            return force || !currentEntry?.data;
         });

         if (!shouldFetch) {
            return;
         }

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
                     if (weekData.week.offset === 0) {
                        storeCachedCurrentWeek(weekData);
                     }
                     next[weekData.week.offset] = createEntry(weekData);
                  });
                  return next;
               });
            })
            .catch((error: unknown) => {
               logError(error, LOAD_ERROR_MESSAGE);
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
      loadBatch(activeBatchStart, activeBatchStart === 0 && Boolean(activeEntry?.isHydrated));

      PREFETCH_BATCHES.forEach((delta) => {
         loadBatch(activeBatchStart + delta * BATCH_SIZE);
      });
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
