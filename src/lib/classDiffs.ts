import type { Class, ClassSnapshot, ClassStatus, Week } from "../types/weeks";
import { isSameClassDetails, toClassSnapshot } from "./classSnapshot";

type DiffLessonStatus = Extract<ClassStatus, "changed" | "cancelled">;

export interface SessionClassDiff {
   schoolClass: Class;
   previousClass: ClassSnapshot;
   status: DiffLessonStatus;
}

export type SessionClassDiffsByWeek = Map<number, Map<string, SessionClassDiff>>;

function cloneLessonWithStatus(schoolClass: Class, status: DiffLessonStatus, previousClass: ClassSnapshot): Class {
   return {
      ...toClassSnapshot(schoolClass),
      status,
      previous: previousClass,
   };
}

function getClassDayKey(schoolClass: Class) {
   return schoolClass.start.split("T")[0] ?? schoolClass.start;
}

function normalizeMatchValue(value: string) {
   return value.trim().toLowerCase();
}

function getClassMatchScore(previousClass: Class, nextClass: Class) {
   const same = (left: string, right: string) => Boolean(left.trim()) && normalizeMatchValue(left) === normalizeMatchValue(right);
   let score = 0;

   if (same(previousClass.title, nextClass.title)) score += 4;
   if (same(previousClass.subject, nextClass.subject)) score += 4;
   if (same(previousClass.teacher, nextClass.teacher)) score += 2;
   if (same(previousClass.description, nextClass.description)) score += 1;
   if (same(previousClass.room, nextClass.room)) score += 1;
   if (getClassDayKey(previousClass) === getClassDayKey(nextClass)) score += 1;

   const hasMatchingIdentity = same(previousClass.title, nextClass.title) || same(previousClass.subject, nextClass.subject);
   return hasMatchingIdentity ? score : 0;
}

function getWeekDiffs(weekDiffs: SessionClassDiffsByWeek, weekOffset: number) {
   let diffs = weekDiffs.get(weekOffset);
   if (!diffs) {
      diffs = new Map<string, SessionClassDiff>();
      weekDiffs.set(weekOffset, diffs);
   }

   return diffs;
}

/**
 * Stores a diff anchored to the first-seen version of the schoolClass (so rendering keeps the original details) but
 * returns a diff against the immediately previous version, which is what change notifications should announce.
 */
function rememberClassDiff(weekDiffs: SessionClassDiffsByWeek, weekOffset: number, schoolClass: Class, previousClass: Class, status: DiffLessonStatus) {
   const diffs = getWeekDiffs(weekDiffs, weekOffset);
   const existingDiff = diffs.get(schoolClass.id) ?? diffs.get(previousClass.id);
   const originalClass = existingDiff?.previousClass ?? toClassSnapshot(previousClass);
   if (schoolClass.id !== previousClass.id) {
      diffs.delete(previousClass.id);
   }
   const diff: SessionClassDiff = {
      schoolClass: cloneLessonWithStatus(schoolClass, status, originalClass),
      previousClass: originalClass,
      status,
   };
   diffs.set(schoolClass.id, diff);

   return {
      schoolClass: cloneLessonWithStatus(schoolClass, status, toClassSnapshot(previousClass)),
      previousClass: toClassSnapshot(previousClass),
      status,
   } satisfies SessionClassDiff;
}

export function recordSessionClassDiffs(previousWeek: Week, nextWeek: Week, weekDiffs: SessionClassDiffsByWeek) {
   const nextById = new Map(nextWeek.classes.map((schoolClass) => [schoolClass.id, schoolClass]));
   const previousById = new Map(previousWeek.classes.map((schoolClass) => [schoolClass.id, schoolClass]));
   const removedLessons = previousWeek.classes.filter((schoolClass) => !nextById.has(schoolClass.id));
   const addedClasses = nextWeek.classes.filter((schoolClass) => !previousById.has(schoolClass.id));
   const matchedRemovedClassIds = new Set<string>();
   const recordedDiffs: SessionClassDiff[] = [];

   previousWeek.classes.forEach((previousClass) => {
      const nextClass = nextById.get(previousClass.id);
      if (!nextClass) {
         return;
      }

      if (clearRevertedDiff(weekDiffs, previousWeek.week.offset, nextClass).length) {
         return;
      }

      if (nextClass.status === "cancelled" && previousClass.status !== "cancelled") {
         recordedDiffs.push(rememberClassDiff(weekDiffs, previousWeek.week.offset, nextClass, previousClass, "cancelled"));
      } else if (!isSameClassDetails(previousClass, nextClass) || previousClass.status !== nextClass.status) {
         recordedDiffs.push(rememberClassDiff(weekDiffs, previousWeek.week.offset, nextClass, previousClass, "changed"));
      }
   });

   addedClasses.forEach((addedLesson) => {
      const revertedDiffIds = clearRevertedDiff(weekDiffs, previousWeek.week.offset, addedLesson);
      if (revertedDiffIds.length) {
         revertedDiffIds.forEach((classId) => {
            if (removedLessons.some((schoolClass) => schoolClass.id === classId)) {
               matchedRemovedClassIds.add(classId);
            }
         });
         return;
      }

      const candidates = removedLessons
         .filter((removedClass) => !matchedRemovedClassIds.has(removedClass.id))
         .map((removedClass) => ({ schoolClass: removedClass, score: getClassMatchScore(removedClass, addedLesson) }))
         .filter((candidate) => candidate.score >= 7)
         .sort((left, right) => right.score - left.score);
      const likelyPreviousLesson = candidates[0]?.schoolClass;

      if (!likelyPreviousLesson || candidates[0]?.score === candidates[1]?.score) {
         return;
      }

      matchedRemovedClassIds.add(likelyPreviousLesson.id);
      recordedDiffs.push(rememberClassDiff(weekDiffs, previousWeek.week.offset, addedLesson, likelyPreviousLesson, "changed"));
   });

   removedLessons.forEach((removedClass) => {
      if (!matchedRemovedClassIds.has(removedClass.id)) {
         recordedDiffs.push(rememberClassDiff(weekDiffs, previousWeek.week.offset, removedClass, removedClass, "cancelled"));
      }
   });

   return recordedDiffs;
}

function clearRevertedDiff(weekDiffs: SessionClassDiffsByWeek, weekOffset: number, schoolClass: Class) {
   const diffs = weekDiffs.get(weekOffset);
   if (!diffs) {
      return [];
   }

   const revertedDiffIds = [...diffs.entries()]
      .filter(
         ([currentLessonId, diff]) =>
            (currentLessonId === schoolClass.id || diff.previousClass.id === schoolClass.id) &&
            isSameClassDetails(diff.previousClass, schoolClass) &&
            diff.previousClass.status === schoolClass.status
      )
      .map(([currentLessonId]) => currentLessonId);

   revertedDiffIds.forEach((classId) => diffs.delete(classId));
   if (diffs.size === 0) {
      weekDiffs.delete(weekOffset);
   }
   return revertedDiffIds;
}

export function applySessionClassDiffs(weekData: Week, weekDiffs: SessionClassDiffsByWeek): Week {
   const diffs = weekDiffs.get(weekData.week.offset);
   if (!diffs?.size) {
      return weekData;
   }

   const freshClassIds = new Set(weekData.classes.map((schoolClass) => schoolClass.id));
   const classes = weekData.classes.map((schoolClass) => {
      const diff = diffs.get(schoolClass.id);
      return diff ? cloneLessonWithStatus(schoolClass, diff.status, diff.previousClass) : schoolClass;
   });

   diffs.forEach((diff, classId) => {
      if (diff.status !== "cancelled" || freshClassIds.has(classId)) {
         return;
      }

      classes.push(cloneLessonWithStatus(diff.schoolClass, "cancelled", diff.previousClass));
   });

   return {
      ...weekData,
      classes,
   };
}
