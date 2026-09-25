import type { Class, ClassStatus } from "../types/weeks";

export const DETAILS_SEPARATOR = " · ";

/** The one icon per change status, shared by the inline markers and the drawer badge. */
export const CLASS_STATUS_ICONS: Record<Exclude<ClassStatus, "scheduled">, string> = {
   added: "fa-solid fa-thumbtack",
   changed: "fa-solid fa-pen",
   cancelled: "fa-solid fa-trash-can",
};

export function getClassLocationLabel(schoolClass: Class): string {
   const room = schoolClass.room.trim();
   const location = schoolClass.location.trim();

   if (room && location) {
      return room.toLowerCase() === location.toLowerCase() ? room : `${room}${DETAILS_SEPARATOR}${location}`;
   }

   return room || location;
}

/** The one-line label for a class: its title, or its subject when untitled. */
export function getClassLabel(schoolClass: Class): string {
   return schoolClass.title || schoolClass.subject;
}

/** "Teacher · Room · Location", the detail line under the class label in the agenda view. */
export function getClassDetailsLabel(schoolClass: Class): string {
   return [schoolClass.teacher, getClassLocationLabel(schoolClass)].filter(Boolean).join(DETAILS_SEPARATOR);
}

/** "Time · Teacher", the first detail line of a grid item; the bare time when no teacher is set. */
export function getClassWhenLabel(schoolClass: Class, timeRange: string): string {
   return [timeRange, schoolClass.teacher.trim()].filter(Boolean).join(DETAILS_SEPARATOR);
}

export function normalizeClassField(value: string) {
   return value.trim().toLowerCase();
}
