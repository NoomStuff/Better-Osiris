import type { Class, ClassSnapshot, Week } from "../types/weeks";
import { toClassSnapshot } from "./classSnapshot";

export type DevClassStatusPreviewMode = "none" | "added" | "changed" | "cancelled" | "mixed";

export const DEV_CLASS_STATUS_PREVIEW_MODES = [
   { id: "none", label: "None", tooltip: "Show classes exactly as OSIRIS reports them" },
   { id: "added", label: "Added", tooltip: "Turn the first class into a fake addition" },
   { id: "changed", label: "Changed", tooltip: "Give the first class fake changes to review" },
   { id: "cancelled", label: "Cancelled", tooltip: "Cancel the first class" },
   { id: "mixed", label: "Mixed", tooltip: "Fake a change, a cancellation and an addition at once" },
] as const satisfies readonly { id: DevClassStatusPreviewMode; label: string; tooltip: string }[];

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
   if (mode === "added" && index === 0) {
      return createAddedPreview(schoolClass);
   }

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

      if (index === 2) {
         return createAddedPreview(schoolClass);
      }
   }

   return schoolClass;
}

function createAddedPreview(schoolClass: Class): Class {
   return { ...toClassSnapshot(schoolClass), status: "added" };
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
