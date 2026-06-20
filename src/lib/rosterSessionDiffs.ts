import type { Lesson, LessonStatus, RosterResponse } from "../types/roster";

type DiffLessonStatus = Extract<LessonStatus, "changed" | "cancelled">;

export interface SessionLessonDiff {
   lesson: Lesson;
   status: DiffLessonStatus;
}

export type SessionLessonDiffsByWeek = Map<number, Map<string, SessionLessonDiff>>;

function cloneLessonWithStatus(lesson: Lesson, status: DiffLessonStatus): Lesson {
   return {
      ...lesson,
      status,
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

function isLikelyMovedLesson(previousLesson: Lesson, nextLesson: Lesson) {
   return (
      previousLesson.title === nextLesson.title &&
      previousLesson.subject === nextLesson.subject &&
      previousLesson.teacher === nextLesson.teacher &&
      (getLessonDayKey(previousLesson) === getLessonDayKey(nextLesson) || previousLesson.room === nextLesson.room)
   );
}

function getWeekDiffs(weekDiffs: SessionLessonDiffsByWeek, weekOffset: number) {
   let diffs = weekDiffs.get(weekOffset);
   if (!diffs) {
      diffs = new Map<string, SessionLessonDiff>();
      weekDiffs.set(weekOffset, diffs);
   }

   return diffs;
}

function rememberLessonDiff(weekDiffs: SessionLessonDiffsByWeek, weekOffset: number, lesson: Lesson, status: DiffLessonStatus) {
   getWeekDiffs(weekDiffs, weekOffset).set(lesson.id, {
      lesson: cloneLessonWithStatus(lesson, status),
      status,
   });
}

export function recordSessionLessonDiffs(previousWeek: RosterResponse, nextWeek: RosterResponse, weekDiffs: SessionLessonDiffsByWeek) {
   const nextById = new Map(nextWeek.lessons.map((lesson) => [lesson.id, lesson]));
   const previousById = new Map(previousWeek.lessons.map((lesson) => [lesson.id, lesson]));
   const removedLessons = previousWeek.lessons.filter((lesson) => !nextById.has(lesson.id));
   const addedLessons = nextWeek.lessons.filter((lesson) => !previousById.has(lesson.id));
   const matchedRemovedLessonIds = new Set<string>();

   previousWeek.lessons.forEach((previousLesson) => {
      const nextLesson = nextById.get(previousLesson.id);
      if (!nextLesson) {
         rememberLessonDiff(weekDiffs, previousWeek.week.offset, previousLesson, "cancelled");
         return;
      }

      if (!lessonsHaveSameVisibleDetails(previousLesson, nextLesson)) {
         rememberLessonDiff(weekDiffs, previousWeek.week.offset, nextLesson, "changed");
      }
   });

   addedLessons.forEach((addedLesson) => {
      const likelyPreviousLesson = removedLessons.find(
         (removedLesson) => !matchedRemovedLessonIds.has(removedLesson.id) && isLikelyMovedLesson(removedLesson, addedLesson)
      );
      if (!likelyPreviousLesson) {
         return;
      }

      matchedRemovedLessonIds.add(likelyPreviousLesson.id);
      rememberLessonDiff(weekDiffs, previousWeek.week.offset, addedLesson, "changed");
   });
}

export function applySessionLessonDiffs(weekData: RosterResponse, weekDiffs: SessionLessonDiffsByWeek): RosterResponse {
   const diffs = weekDiffs.get(weekData.week.offset);
   if (!diffs?.size) {
      return weekData;
   }

   const freshLessonIds = new Set(weekData.lessons.map((lesson) => lesson.id));
   const lessons = weekData.lessons.map((lesson) => {
      const diff = diffs.get(lesson.id);
      return diff ? cloneLessonWithStatus(lesson, diff.status === "cancelled" ? "changed" : diff.status) : lesson;
   });

   diffs.forEach((diff, lessonId) => {
      if (diff.status !== "cancelled" || freshLessonIds.has(lessonId)) {
         return;
      }

      lessons.push(cloneLessonWithStatus(diff.lesson, "cancelled"));
   });

   return {
      ...weekData,
      lessons,
   };
}
