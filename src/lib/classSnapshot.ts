import type { Class, ClassSnapshot } from "../types/weeks";

/** Fields that define a schoolClass as users see it; id and status are compared separately where they matter. */
const CLASS_DETAIL_FIELDS = ["title", "subject", "start", "end", "teacher", "room", "location", "description"] as const;

export function toClassSnapshot(schoolClass: Class): ClassSnapshot {
   return {
      id: schoolClass.id,
      title: schoolClass.title,
      subject: schoolClass.subject,
      start: schoolClass.start,
      end: schoolClass.end,
      teacher: schoolClass.teacher,
      room: schoolClass.room,
      location: schoolClass.location,
      description: schoolClass.description,
      status: schoolClass.status,
   };
}

export function isSameClassDetails(left: ClassSnapshot, right: ClassSnapshot) {
   return CLASS_DETAIL_FIELDS.every((field) => left[field] === right[field]);
}
