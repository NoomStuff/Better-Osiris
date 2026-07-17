import type { RosterBatchResponse, RosterResponse } from "../types/roster";
import { notifyRosterDiffs } from "./rosterNotifications";
import { readCachedCurrentWeek, readCachedLastWeek, readSessionLessonDiffs, storeCachedCurrentWeek, storeSessionLessonDiffs } from "./rosterPersistence";
import { applySessionLessonDiffs, recordSessionLessonDiffs, type SessionLessonDiff, type SessionLessonDiffsByWeek } from "./rosterSessionDiffs";
import { createWeekEntry, isSameRosterData, type WeekEntries } from "./rosterWeekPolicy";

export function getInitialRosterEntries(): WeekEntries {
   const sessionDiffs = readSessionLessonDiffs();
   const cachedLastWeek = readCachedLastWeek();
   const cachedCurrentWeek = readCachedCurrentWeek();
   const entries: WeekEntries = {};

   if (cachedLastWeek) {
      entries[-1] = createWeekEntry(applySessionLessonDiffs(cachedLastWeek, sessionDiffs), { isHydrated: true });
   }

   if (cachedCurrentWeek) {
      entries[0] = createWeekEntry(applySessionLessonDiffs(cachedCurrentWeek, sessionDiffs), { isHydrated: true });
   }

   return entries;
}

export function getDisplayWeeksFromPayload(
   payload: RosterBatchResponse,
   entries: WeekEntries,
   latestRawWeeks: Map<number, RosterResponse>,
   sessionLessonDiffs: SessionLessonDiffsByWeek
) {
   let sessionDiffsChanged = false;
   const currentWeekDiffs: SessionLessonDiff[] = [];
   const weeks: RosterResponse[] = [];

   for (const weekData of payload.weeks) {
      const comparisonBase = latestRawWeeks.get(weekData.week.offset) ?? entries[weekData.week.offset]?.data ?? null;
      if (comparisonBase && !isSameRosterData(comparisonBase, weekData)) {
         const previousDiffCount = countDiffs(sessionLessonDiffs);
         const recordedDiffs = recordSessionLessonDiffs(comparisonBase, weekData, sessionLessonDiffs);
         sessionDiffsChanged ||= recordedDiffs.length > 0 || previousDiffCount !== countDiffs(sessionLessonDiffs);
         if (weekData.week.offset === 0) {
            currentWeekDiffs.push(...recordedDiffs);
         }
      }

      latestRawWeeks.set(weekData.week.offset, weekData);
      if (weekData.week.offset === 0) {
         storeCachedCurrentWeek(weekData);
      }

      weeks.push(applySessionLessonDiffs(weekData, sessionLessonDiffs));
   }

   if (sessionDiffsChanged) {
      storeSessionLessonDiffs(sessionLessonDiffs);
   }
   notifyRosterDiffs(currentWeekDiffs);
   return weeks;
}

function countDiffs(sessionDiffs: SessionLessonDiffsByWeek) {
   return [...sessionDiffs.values()].reduce((total, diffs) => total + diffs.size, 0);
}
