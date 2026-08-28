import { removeBrowserStorage } from "./browserStorage";

export const CURRENT_WEEK_CACHE_KEY = "roster-current-week-cache-v2";
export const LAST_WEEK_CACHE_KEY = "roster-last-week-cache-v1";
export const SESSION_CLASS_DIFFS_KEY = "roster-session-class-diffs-v2";

export function clearWeekBrowserCache() {
   if (typeof window === "undefined") {
      return;
   }

   removeBrowserStorage("localStorage", CURRENT_WEEK_CACHE_KEY);
   removeBrowserStorage("localStorage", LAST_WEEK_CACHE_KEY);
   removeBrowserStorage("sessionStorage", SESSION_CLASS_DIFFS_KEY);
}
