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

export function normalizeClassField(value: string) {
   return value.trim().toLowerCase();
}
