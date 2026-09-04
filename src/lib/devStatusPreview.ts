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
      start: shiftPreviewDateTime(schoolClass.start, -30),
      end: shiftPreviewDateTime(schoolClass.end, -30),
      teacher: schoolClass.teacher,
      room: schoolClass.room === "A101" ? "B12" : "A101",
      location: schoolClass.location,
      description: schoolClass.description,
      status: "scheduled",
   };
}

function shiftPreviewDateTime(value: string, minutes: number): string {
   const match = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/.exec(value);
   if (!match) {
      return value;
   }

   const [, year, month, day, hour, minute, second = "00"] = match;
   const shifted = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second)));
   shifted.setUTCMinutes(shifted.getUTCMinutes() + minutes);

   return shifted.toISOString().slice(0, 19);
}
