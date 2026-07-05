export const CURRENT_WEEK_CACHE_KEY = "roster-current-week-cache-v2";
export const LAST_WEEK_CACHE_KEY = "roster-last-week-cache-v1";
export const SESSION_LESSON_DIFFS_KEY = "roster-session-lesson-diffs-v2";

export function clearRosterBrowserCache() {
   if (typeof window === "undefined") {
      return;
   }

   window.localStorage.removeItem(CURRENT_WEEK_CACHE_KEY);
   window.localStorage.removeItem(LAST_WEEK_CACHE_KEY);
   window.sessionStorage.removeItem(SESSION_LESSON_DIFFS_KEY);
}
