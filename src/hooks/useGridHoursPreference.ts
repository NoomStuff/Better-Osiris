import { useEffect, useState } from "react";
import { readBrowserStorage, writeBrowserStorage } from "../lib/browserStorage";
import { DEFAULT_GRID_HOURS, normalizeGridHourRange, type GridHourRange } from "../lib/gridHours";

const STORAGE_KEY = "roster-grid-hours";

export function useGridHoursPreference() {
   const [gridHours, setGridHours] = useState<GridHourRange>(readStoredGridHours);

   useEffect(() => {
      writeBrowserStorage("localStorage", STORAGE_KEY, gridHours.join(","));
   }, [gridHours]);

   return [gridHours, setGridHours] as const;
}

function readStoredGridHours(): GridHourRange {
   const [start, end] = (readBrowserStorage("localStorage", STORAGE_KEY) ?? "").split(",").map(Number);
   if (!Number.isInteger(start) || !Number.isInteger(end) || start === undefined || end === undefined || start < 0 || end > 24 || start >= end) {
      return DEFAULT_GRID_HOURS;
   }
   return normalizeGridHourRange(start, end);
}
