import type { Lesson, LessonSnapshot, LessonStatus, RosterResponse } from "../types/roster";

type DiffLessonStatus = Extract<LessonStatus, "changed" | "cancelled">;

export interface SessionLessonDiff {
   lesson: Lesson;
   previousLesson: LessonSnapshot;
   status: DiffLessonStatus;
}

export type SessionLessonDiffsByWeek = Map<number, Map<string, SessionLessonDiff>>;

function toLessonSnapshot(lesson: Lesson): LessonSnapshot {
   return {
      id: lesson.id,
      title: lesson.title,
      subject: lesson.subject,
      start: lesson.start,
      end: lesson.end,
      teacher: lesson.teacher,
      room: lesson.room,
      location: lesson.location,
      description: lesson.description,
      status: lesson.status,
   };
}

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

function lessonsHaveSameVisibleDetails(left: Lesson, right: Lesson) {
   return (
      left.title === right.title &&
      left.subject === right.subject &&
      left.start === right.start &&
      left.end === right.end &&
      left.teacher === right.teacher &&
      left.room === right.room &&
      left.location === right.location &&
      left.description === right.description
   );
}

function normalizeMatchValue(value: string) {
   return value.trim().toLocaleLowerCase();
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

function rememberLessonDiff(weekDiffs: SessionLessonDiffsByWeek, weekOffset: number, lesson: Lesson, previousLesson: Lesson, status: DiffLessonStatus) {
   const diffs = getWeekDiffs(weekDiffs, weekOffset);
   const existingDiff = diffs.get(lesson.id);
   const originalLesson = existingDiff?.previousLesson ?? toLessonSnapshot(previousLesson);
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

      if (nextLesson.status === "cancelled" && previousLesson.status !== "cancelled") {
         recordedDiffs.push(rememberLessonDiff(weekDiffs, previousWeek.week.offset, nextLesson, previousLesson, "cancelled"));
      } else if (!lessonsHaveSameVisibleDetails(previousLesson, nextLesson) || previousLesson.status !== nextLesson.status) {
         recordedDiffs.push(rememberLessonDiff(weekDiffs, previousWeek.week.offset, nextLesson, previousLesson, "changed"));
      }
   });

   addedLessons.forEach((addedLesson) => {
      const candidates = removedLessons
         .filter((removedLesson) => !matchedRemovedLessonIds.has(removedLesson.id))
         .map((removedLesson) => ({ lesson: removedLesson, score: getLessonMatchScore(removedLesson, addedLesson) }))
         .filter((candidate) => candidate.score >= 7)
         .sort((left, right) => right.score - left.score);
      const likelyPreviousLesson = candidates[0]?.lesson;

      if (!likelyPreviousLesson) {
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
