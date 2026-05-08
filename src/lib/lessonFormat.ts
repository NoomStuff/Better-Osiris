import type { Lesson } from "../types/roster";

export const DETAILS_SEPARATOR = " · ";

export function getLessonLocationLabel(lesson: Lesson): string {
   const room = lesson.room.trim();
   const location = lesson.location.trim();

   if (room && location) {
      return room.toLowerCase() === location.toLowerCase() ? room : `${room}${DETAILS_SEPARATOR}${location}`;
   }

   return room || location;
}
