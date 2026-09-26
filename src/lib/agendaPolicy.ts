import { parseLocalDateTime, toDayKey } from "./date";
import type { Day, Week } from "../types/weeks";

export type AgendaFoldingMode = "single" | "smart" | "all";

export function getDefaultExpandedDays(days: Day[], now: Date | null, foldingMode: AgendaFoldingMode, isHomeWeek: boolean, nextClassDay: string | null) {
   const todayKey = now ? toDayKey(now) : null;
   if (foldingMode === "all") {
      return new Set(days.map((day) => day.key));
   }
   return new Set(
      days
         .filter((day) => {
            if (foldingMode === "single") return day.key === nextClassDay;
            if (!isHomeWeek) return day.classes.length > 0;
            return day.key === todayKey || (todayKey !== null && day.key > todayKey && day.classes.length > 0);
         })
         .map((day) => day.key)
   );
}

export function getNextClassDay(weeks: Week[], now: Date): string | null {
   let nextStart: Date | null = null;
   for (const week of weeks) {
      for (const item of week.classes) {
         if (item.status === "cancelled") continue;
         const start = parseLocalDateTime(item.start);
         if (start >= now && (nextStart === null || start < nextStart)) nextStart = start;
      }
   }
   return nextStart ? toDayKey(nextStart) : null;
}
