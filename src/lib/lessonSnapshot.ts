import type { Lesson, LessonSnapshot } from "../types/roster";

/** Fields that define a lesson as users see it; id and status are compared separately where they matter. */
const LESSON_DETAIL_FIELDS = ["title", "subject", "start", "end", "teacher", "room", "location", "description"] as const;

export function toLessonSnapshot(lesson: Lesson): LessonSnapshot {
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

export function isSameLessonDetails(left: LessonSnapshot, right: LessonSnapshot) {
   return LESSON_DETAIL_FIELDS.every((field) => left[field] === right[field]);
}
