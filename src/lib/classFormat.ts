import type { Class } from "../types/weeks";

export const DETAILS_SEPARATOR = " · ";

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
