export const CURRENT_WEEK_CACHE_KEY = "roster-current-week-cache-v2";
export const LAST_WEEK_CACHE_KEY = "roster-last-week-cache-v1";
export const SESSION_LESSON_DIFFS_KEY = "roster-session-lesson-diffs-v2";

export function clearRosterBrowserCache() {
   if (typeof window === "undefined") {
      return;
   }

   removeBrowserStorage("localStorage", CURRENT_WEEK_CACHE_KEY);
   removeBrowserStorage("localStorage", LAST_WEEK_CACHE_KEY);
   removeBrowserStorage("sessionStorage", SESSION_LESSON_DIFFS_KEY);
}
import { removeBrowserStorage } from "./browserStorage";
