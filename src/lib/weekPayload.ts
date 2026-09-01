import type { WeekBatch, Week } from "../types/weeks";
import { notifyClassDiffs } from "./classNotifications";
import { readCachedCurrentWeek, readCachedLastWeek, readSessionClassDiffs, storeCachedCurrentWeek, storeSessionClassDiffs } from "./weekPersistence";
import { applySessionClassDiffs, recordSessionClassDiffs, type SessionClassDiff, type SessionClassDiffsByWeek } from "./classDiffs";
import { createWeekEntry, isSameWeekData, type WeekEntries } from "./weekPolicy";

export function getInitialWeekEntries(): WeekEntries {
   const sessionDiffs = readSessionClassDiffs();
   const cachedLastWeek = readCachedLastWeek();
   const cachedCurrentWeek = readCachedCurrentWeek();
   const entries: WeekEntries = {};

   if (cachedLastWeek) {
      entries[-1] = createWeekEntry(applySessionClassDiffs(cachedLastWeek, sessionDiffs), { isHydrated: true });
   }

   if (cachedCurrentWeek) {
      entries[0] = createWeekEntry(applySessionClassDiffs(cachedCurrentWeek, sessionDiffs), { isHydrated: true });
   }

   return entries;
}

export function getDisplayWeeksFromPayload(
   payload: WeekBatch,
   entries: WeekEntries,
   latestRawWeeks: Map<number, Week>,
   sessionLessonDiffs: SessionClassDiffsByWeek
) {
   let sessionDiffsChanged = false;
   const currentWeekDiffs: SessionClassDiff[] = [];
   const weeks: Week[] = [];

   for (const weekData of payload.weeks) {
      const comparisonBase = latestRawWeeks.get(weekData.week.offset) ?? entries[weekData.week.offset]?.data ?? null;
      if (comparisonBase && comparisonBase.week.start !== weekData.week.start) {
         const previousDiffCount = countDiffs(sessionLessonDiffs);
         sessionLessonDiffs.delete(weekData.week.offset);
         sessionDiffsChanged ||= previousDiffCount !== countDiffs(sessionLessonDiffs);
      } else if (comparisonBase && !isSameWeekData(comparisonBase, weekData)) {
         const previousDiffCount = countDiffs(sessionLessonDiffs);
         const recordedDiffs = recordSessionClassDiffs(comparisonBase, weekData, sessionLessonDiffs);
         sessionDiffsChanged ||= recordedDiffs.length > 0 || previousDiffCount !== countDiffs(sessionLessonDiffs);
         if (weekData.week.offset === 0) {
            currentWeekDiffs.push(...recordedDiffs);
         }
      }

      latestRawWeeks.set(weekData.week.offset, weekData);
      if (weekData.week.offset === 0) {
         storeCachedCurrentWeek(weekData);
      }

      weeks.push(applySessionClassDiffs(weekData, sessionLessonDiffs));
   }

   if (sessionDiffsChanged) {
      storeSessionClassDiffs(sessionLessonDiffs);
   }
   notifyClassDiffs(currentWeekDiffs);
   return weeks;
}

function countDiffs(sessionDiffs: SessionClassDiffsByWeek) {
   return [...sessionDiffs.values()].reduce((total, diffs) => total + diffs.size, 0);
}
