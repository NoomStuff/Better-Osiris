import type { Class, ClassSnapshot, Week } from "../types/weeks";

export type DevClassStatusPreviewMode = "none" | "changed" | "cancelled" | "mixed";

export const DEV_CLASS_STATUS_PREVIEW_MODES = [
   { id: "none", label: "None" },
   { id: "changed", label: "Changed" },
   { id: "cancelled", label: "Cancelled" },
   { id: "mixed", label: "Mixed" },
] as const satisfies readonly { id: DevClassStatusPreviewMode; label: string }[];

export function isDevClassStatusPreviewMode(value: string | null): value is DevClassStatusPreviewMode {
   return DEV_CLASS_STATUS_PREVIEW_MODES.some((mode) => mode.id === value);
}

export function applyDevClassStatusPreview(data: Week | null, mode: DevClassStatusPreviewMode): Week | null {
   if (!data || mode === "none") {
      return data;
   }

   return {
      ...data,
      classes: data.classes.map((schoolClass, index) => applyPreviewStatus(schoolClass, index, mode)),
   };
}

function applyPreviewStatus(schoolClass: Class, index: number, mode: DevClassStatusPreviewMode): Class {
   if (mode === "changed" && index === 0) {
      return createChangedPreview(schoolClass);
   }

   if (mode === "cancelled" && index === 0) {
      return { ...schoolClass, status: "cancelled" };
   }

   if (mode === "mixed") {
      if (index === 0) {
         return createChangedPreview(schoolClass);
      }

      if (index === 1) {
         return { ...schoolClass, status: "cancelled" };
      }
   }

   return schoolClass;
}

function createChangedPreview(schoolClass: Class): Class {
   return {
      ...schoolClass,
      status: "changed",
      previous: schoolClass.previous ?? createOriginalPreview(schoolClass),
   };
}

function createOriginalPreview(schoolClass: Class): ClassSnapshot {
   return {
      id: schoolClass.id,
      title: schoolClass.title,
      subject: schoolClass.subject,
      start: schoolClass.start,
      end: schoolClass.end,
      teacher: schoolClass.teacher,
      room: schoolClass.room === "A101" ? "B12" : "A101",
      location: schoolClass.location,
      description: schoolClass.description,
      status: "scheduled",
   };
}
