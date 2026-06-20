import type { Lesson, RosterResponse } from "../types/roster";

export type DevLessonStatusPreviewMode = "none" | "changed" | "cancelled" | "mixed";

export const DEV_LESSON_STATUS_PREVIEW_MODES = [
   { id: "none", label: "None" },
   { id: "changed", label: "Changed" },
   { id: "cancelled", label: "Cancelled" },
   { id: "mixed", label: "Mixed" },
] as const satisfies readonly { id: DevLessonStatusPreviewMode; label: string }[];

export function isDevLessonStatusPreviewMode(value: string | null): value is DevLessonStatusPreviewMode {
   return DEV_LESSON_STATUS_PREVIEW_MODES.some((mode) => mode.id === value);
}

export function applyDevLessonStatusPreview(data: RosterResponse | null, mode: DevLessonStatusPreviewMode): RosterResponse | null {
   if (!data || mode === "none") {
      return data;
   }

   return {
      ...data,
      lessons: data.lessons.map((lesson, index) => applyPreviewStatus(lesson, index, mode)),
   };
}

function applyPreviewStatus(lesson: Lesson, index: number, mode: DevLessonStatusPreviewMode): Lesson {
   if (mode === "changed" && index === 0) {
      return { ...lesson, status: "changed" };
   }

   if (mode === "cancelled" && index === 0) {
      return { ...lesson, status: "cancelled" };
   }

   if (mode === "mixed") {
      if (index === 0) {
         return { ...lesson, status: "changed" };
      }

      if (index === 1) {
         return { ...lesson, status: "cancelled" };
      }
   }

   return lesson;
}
