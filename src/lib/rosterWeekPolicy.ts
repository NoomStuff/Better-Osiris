import { MAX_WEEK_OFFSET, MIN_WEEK_OFFSET, type RosterResponse } from "../../shared/roster";
import { formatWeekTitle, getIsoWeekNumber, shiftIsoDateByDays } from "./date";
import type { RosterLoadError } from "./rosterLoadError";

export interface WeekEntry {
   data: RosterResponse | null;
   error: RosterLoadError | null;
   isFetching: boolean;
   isHydrated: boolean;
   retryAt: number;
   retryDelayMs: number;
   updatedAt: number;
}

export type WeekEntries = Partial<Record<number, WeekEntry>>;

export const ROSTER_BATCH_SIZE = 5;

export function createWeekEntry(data: RosterResponse | null, overrides?: Partial<WeekEntry>): WeekEntry {
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

export function getDerivedWeekTitle(offset: number, entries: WeekEntries) {
   const activeEntry = entries[offset];
   if (activeEntry?.data) {
      const { start, end, number } = activeEntry.data.week;
      return formatWeekTitle(start, end, number);
   }

   const closestEntry = Object.keys(entries)
      .map((entryOffset) => ({ offset: Number(entryOffset), entry: entries[Number(entryOffset)] }))
      .filter((entry): entry is { offset: number; entry: WeekEntry } => Boolean(entry.entry?.data))
      .sort((left, right) => Math.abs(left.offset - offset) - Math.abs(right.offset - offset))[0];

   const closestData = closestEntry?.entry.data ?? null;
   const closestOffset = closestEntry?.offset;
   if (!closestData || closestOffset === undefined) {
      return "Loading week...";
   }

   const offsetDelta = offset - closestOffset;
   const derivedStart = shiftIsoDateByDays(closestData.week.start, offsetDelta * 7);
   const derivedEnd = shiftIsoDateByDays(closestData.week.end, offsetDelta * 7);
   return formatWeekTitle(derivedStart, derivedEnd, getIsoWeekNumber(derivedStart));
}

export function getBatchStart(targetOffset: number) {
   return targetOffset < 0 ? MIN_WEEK_OFFSET : Math.max(MIN_WEEK_OFFSET, Math.floor(targetOffset / ROSTER_BATCH_SIZE) * ROSTER_BATCH_SIZE);
}

export function getBatchOffsets(startOffset: number) {
   if (startOffset < 0) {
      return [MIN_WEEK_OFFSET];
   }

   const endOffset = Math.min(startOffset + ROSTER_BATCH_SIZE - 1, MAX_WEEK_OFFSET);
   return Array.from({ length: endOffset - startOffset + 1 }, (_, index) => startOffset + index);
}

export function getAdjacentBatchStarts(startOffset: number) {
   const previous = startOffset === 0 ? MIN_WEEK_OFFSET : startOffset > 0 ? Math.max(MIN_WEEK_OFFSET, startOffset - ROSTER_BATCH_SIZE) : null;
   const next = startOffset < 0 ? 0 : startOffset + ROSTER_BATCH_SIZE;

   return [previous, next].filter((batchStart): batchStart is number => batchStart !== null && batchStart >= MIN_WEEK_OFFSET && batchStart <= MAX_WEEK_OFFSET);
}

export function canNavigateToWeek(offset: number, entries: WeekEntries) {
   if (offset < MIN_WEEK_OFFSET || offset > MAX_WEEK_OFFSET) {
      return false;
   }

   const entry = entries[offset];
   return offset < 0 ? Boolean(entry?.data) : !(entry?.error && !entry.data);
}

export function isSameRosterData(left: RosterResponse | null | undefined, right: RosterResponse) {
   if (
      left?.week.offset !== right.week.offset ||
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
