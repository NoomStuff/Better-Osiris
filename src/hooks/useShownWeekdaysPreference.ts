import { useEffect, useState } from "react";
import { readBrowserStorage, writeBrowserStorage } from "../lib/browserStorage";
import type { IsoWeekday } from "../lib/date";
import { DEFAULT_SHOWN_WEEKDAYS } from "../lib/weekLayout";

const STORAGE_KEY = "roster-shown-weekdays";

function parseIsoWeekday(value: string): IsoWeekday | null {
   const weekday = Number(value);
   return Number.isInteger(weekday) && weekday >= 1 && weekday <= 7 ? (weekday as IsoWeekday) : null;
}

function parseStoredWeekdays(stored: string | null): IsoWeekday[] {
   if (stored === null) {
      return [...DEFAULT_SHOWN_WEEKDAYS];
   }

   const weekdays = [
      ...new Set(
         stored
            .split(",")
            .map(parseIsoWeekday)
            .filter((weekday) => weekday !== null)
      ),
   ].sort((a, b) => a - b);
   return weekdays.length > 0 ? weekdays : [...DEFAULT_SHOWN_WEEKDAYS];
}

export function useShownWeekdaysPreference() {
   const [shownWeekdays, setShownWeekdays] = useState<IsoWeekday[]>(() => parseStoredWeekdays(readBrowserStorage("localStorage", STORAGE_KEY)));

   useEffect(() => {
      writeBrowserStorage("localStorage", STORAGE_KEY, shownWeekdays.join(","));
   }, [shownWeekdays]);

   return [shownWeekdays, setShownWeekdays] as const;
}
