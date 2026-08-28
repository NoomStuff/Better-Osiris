import type { Lesson, LessonSnapshot, LessonStatus, RosterResponse } from "../types/roster";
import { isSameLessonDetails, toLessonSnapshot } from "./lessonSnapshot";

type DiffLessonStatus = Extract<LessonStatus, "changed" | "cancelled">;

export interface SessionLessonDiff {
   lesson: Lesson;
   previousLesson: LessonSnapshot;
   status: DiffLessonStatus;
}

export type SessionLessonDiffsByWeek = Map<number, Map<string, SessionLessonDiff>>;

function cloneLessonWithStatus(lesson: Lesson, status: DiffLessonStatus, previousLesson: LessonSnapshot): Lesson {
   return {
      ...toLessonSnapshot(lesson),
      status,
      previous: previousLesson,
   };
}

function getLessonDayKey(lesson: Lesson) {
   return lesson.start.split("T")[0] ?? lesson.start;
}

function normalizeMatchValue(value: string) {
   return value.trim().toLowerCase();
}

function getLessonMatchScore(previousLesson: Lesson, nextLesson: Lesson) {
   const same = (left: string, right: string) => Boolean(left.trim()) && normalizeMatchValue(left) === normalizeMatchValue(right);
   let score = 0;

   if (same(previousLesson.title, nextLesson.title)) score += 4;
   if (same(previousLesson.subject, nextLesson.subject)) score += 4;
   if (same(previousLesson.teacher, nextLesson.teacher)) score += 2;
   if (same(previousLesson.description, nextLesson.description)) score += 1;
   if (same(previousLesson.room, nextLesson.room)) score += 1;
   if (getLessonDayKey(previousLesson) === getLessonDayKey(nextLesson)) score += 1;

   const hasMatchingIdentity = same(previousLesson.title, nextLesson.title) || same(previousLesson.subject, nextLesson.subject);
   return hasMatchingIdentity ? score : 0;
}

function getWeekDiffs(weekDiffs: SessionLessonDiffsByWeek, weekOffset: number) {
   let diffs = weekDiffs.get(weekOffset);
   if (!diffs) {
      diffs = new Map<string, SessionLessonDiff>();
      weekDiffs.set(weekOffset, diffs);
   }

   return diffs;
}

/**
 * Stores a diff anchored to the first-seen version of the lesson (so rendering keeps the original details) but
 * returns a diff against the immediately previous version, which is what change notifications should announce.
 */
function rememberLessonDiff(weekDiffs: SessionLessonDiffsByWeek, weekOffset: number, lesson: Lesson, previousLesson: Lesson, status: DiffLessonStatus) {
   const diffs = getWeekDiffs(weekDiffs, weekOffset);
   const existingDiff = diffs.get(lesson.id) ?? diffs.get(previousLesson.id);
   const originalLesson = existingDiff?.previousLesson ?? toLessonSnapshot(previousLesson);
   if (lesson.id !== previousLesson.id) {
      diffs.delete(previousLesson.id);
   }
   const diff: SessionLessonDiff = {
      lesson: cloneLessonWithStatus(lesson, status, originalLesson),
      previousLesson: originalLesson,
      status,
   };
   diffs.set(lesson.id, diff);

   return {
      lesson: cloneLessonWithStatus(lesson, status, toLessonSnapshot(previousLesson)),
      previousLesson: toLessonSnapshot(previousLesson),
      status,
   } satisfies SessionLessonDiff;
}

export function recordSessionLessonDiffs(previousWeek: RosterResponse, nextWeek: RosterResponse, weekDiffs: SessionLessonDiffsByWeek) {
   const nextById = new Map(nextWeek.lessons.map((lesson) => [lesson.id, lesson]));
   const previousById = new Map(previousWeek.lessons.map((lesson) => [lesson.id, lesson]));
   const removedLessons = previousWeek.lessons.filter((lesson) => !nextById.has(lesson.id));
   const addedLessons = nextWeek.lessons.filter((lesson) => !previousById.has(lesson.id));
   const matchedRemovedLessonIds = new Set<string>();
   const recordedDiffs: SessionLessonDiff[] = [];

   previousWeek.lessons.forEach((previousLesson) => {
      const nextLesson = nextById.get(previousLesson.id);
      if (!nextLesson) {
         return;
      }

      if (clearRevertedDiff(weekDiffs, previousWeek.week.offset, nextLesson).length) {
         return;
      }

      if (nextLesson.status === "cancelled" && previousLesson.status !== "cancelled") {
         recordedDiffs.push(rememberLessonDiff(weekDiffs, previousWeek.week.offset, nextLesson, previousLesson, "cancelled"));
      } else if (!isSameLessonDetails(previousLesson, nextLesson) || previousLesson.status !== nextLesson.status) {
         recordedDiffs.push(rememberLessonDiff(weekDiffs, previousWeek.week.offset, nextLesson, previousLesson, "changed"));
      }
   });

   addedLessons.forEach((addedLesson) => {
      const revertedDiffIds = clearRevertedDiff(weekDiffs, previousWeek.week.offset, addedLesson);
      if (revertedDiffIds.length) {
         revertedDiffIds.forEach((lessonId) => {
            if (removedLessons.some((lesson) => lesson.id === lessonId)) {
               matchedRemovedLessonIds.add(lessonId);
            }
         });
         return;
      }

      const candidates = removedLessons
         .filter((removedLesson) => !matchedRemovedLessonIds.has(removedLesson.id))
         .map((removedLesson) => ({ lesson: removedLesson, score: getLessonMatchScore(removedLesson, addedLesson) }))
         .filter((candidate) => candidate.score >= 7)
         .sort((left, right) => right.score - left.score);
      const likelyPreviousLesson = candidates[0]?.lesson;

      if (!likelyPreviousLesson || candidates[0]?.score === candidates[1]?.score) {
         return;
      }

      matchedRemovedLessonIds.add(likelyPreviousLesson.id);
      recordedDiffs.push(rememberLessonDiff(weekDiffs, previousWeek.week.offset, addedLesson, likelyPreviousLesson, "changed"));
   });

   removedLessons.forEach((removedLesson) => {
      if (!matchedRemovedLessonIds.has(removedLesson.id)) {
         recordedDiffs.push(rememberLessonDiff(weekDiffs, previousWeek.week.offset, removedLesson, removedLesson, "cancelled"));
      }
   });

   return recordedDiffs;
}

function clearRevertedDiff(weekDiffs: SessionLessonDiffsByWeek, weekOffset: number, lesson: Lesson) {
   const diffs = weekDiffs.get(weekOffset);
   if (!diffs) {
      return [];
   }

   const revertedDiffIds = [...diffs.entries()]
      .filter(
         ([currentLessonId, diff]) =>
            (currentLessonId === lesson.id || diff.previousLesson.id === lesson.id) &&
            isSameLessonDetails(diff.previousLesson, lesson) &&
            diff.previousLesson.status === lesson.status
      )
      .map(([currentLessonId]) => currentLessonId);

   revertedDiffIds.forEach((lessonId) => diffs.delete(lessonId));
   if (diffs.size === 0) {
      weekDiffs.delete(weekOffset);
   }
   return revertedDiffIds;
}

export function applySessionLessonDiffs(weekData: RosterResponse, weekDiffs: SessionLessonDiffsByWeek): RosterResponse {
   const diffs = weekDiffs.get(weekData.week.offset);
   if (!diffs?.size) {
      return weekData;
   }

   const freshLessonIds = new Set(weekData.lessons.map((lesson) => lesson.id));
   const lessons = weekData.lessons.map((lesson) => {
      const diff = diffs.get(lesson.id);
      return diff ? cloneLessonWithStatus(lesson, diff.status, diff.previousLesson) : lesson;
   });

   diffs.forEach((diff, lessonId) => {
      if (diff.status !== "cancelled" || freshLessonIds.has(lessonId)) {
         return;
      }

      lessons.push(cloneLessonWithStatus(diff.lesson, "cancelled", diff.previousLesson));
   });

   return {
      ...weekData,
      lessons,
   };
}
