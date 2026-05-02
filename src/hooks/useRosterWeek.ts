import { useEffect, useMemo, useRef, useState } from "react";
import { fetchRosterWeek } from "../api/roster";
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

type WeekEntries = Record<number, WeekEntry>;

const CURRENT_WEEK_CACHE_KEY = "roster-current-week-cache-v1";
const LOAD_ERROR_MESSAGE = "Something went wrong while loading the roster.";
const PREFETCH_WINDOW = [-1, 1];
const MIN_WEEK_OFFSET = 0;
const MAX_WEEK_OFFSET = 52;

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

function readCachedCurrentWeek() {
   if (typeof window === "undefined") {
      return null;
   }

   try {
      const cached = window.localStorage.getItem(CURRENT_WEEK_CACHE_KEY);
      if (!cached) {
         return null;
      }

      return JSON.parse(cached) as RosterResponse;
   } catch (error) {
      logError(error, "Failed to parse cached current week.");
      return null;
   }
}

function storeCachedCurrentWeek(data: RosterResponse) {
   if (typeof window === "undefined" || data.week.offset !== 0) {
      return;
   }

   window.localStorage.setItem(CURRENT_WEEK_CACHE_KEY, JSON.stringify(data));
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
   const requestsRef = useRef(new Map<number, Promise<void>>());

   useEffect(() => {
      entriesRef.current = entries;
   }, [entries]);

   useEffect(() => {
      const loadWeek = (targetOffset: number, force = false) => {
         if (targetOffset < MIN_WEEK_OFFSET || targetOffset > MAX_WEEK_OFFSET) {
            return;
         }

         const currentEntry = entriesRef.current[targetOffset];

         if (!force && (currentEntry?.data || currentEntry?.isFetching || requestsRef.current.has(targetOffset))) {
            return;
         }

         setEntries((current) => ({
            ...current,
            [targetOffset]: createEntry(current[targetOffset]?.data ?? null, {
               error: "",
               isFetching: true,
               isHydrated: force ? false : (current[targetOffset]?.isHydrated ?? false),
               updatedAt: current[targetOffset]?.updatedAt ?? 0,
            }),
         }));

         const request = fetchRosterWeek(targetOffset)
            .then((data) => {
               if (targetOffset === 0) {
                  storeCachedCurrentWeek(data);
               }

               setEntries((current) => ({
                  ...current,
                  [targetOffset]: createEntry(data),
               }));
            })
            .catch((error: unknown) => {
               logError(error, LOAD_ERROR_MESSAGE);
               setEntries((current) => ({
                  ...current,
                  [targetOffset]: createEntry(current[targetOffset]?.data ?? null, {
                     error: LOAD_ERROR_MESSAGE,
                     isFetching: false,
                     isHydrated: false,
                     updatedAt: current[targetOffset]?.updatedAt ?? 0,
                  }),
               }));
            })
            .finally(() => {
               requestsRef.current.delete(targetOffset);
            });

         requestsRef.current.set(targetOffset, request);
      };

      const activeEntry = entriesRef.current[offset];
      loadWeek(offset, offset === 0 && Boolean(activeEntry?.isHydrated));

      PREFETCH_WINDOW.forEach((delta) => {
         loadWeek(offset + delta);
      });
   }, [offset]);

   const activeEntry = entries[offset];
   const data = activeEntry?.data ?? null;
   const loading = !data && (activeEntry?.isFetching ?? true);
   const error = activeEntry?.error ?? "";
   const title = useMemo(() => getDerivedTitle(offset, entries), [entries, offset]);

   return {
      data,
      error,
      loading,
      title,
   };
}
