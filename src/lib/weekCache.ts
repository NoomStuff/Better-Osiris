import { removeBrowserStorage } from "./browserStorage";

export const WEEK_CACHE_KEY = "roster-weeks-v3";
export const SESSION_CLASS_DIFFS_KEY = "roster-session-class-diffs-v3";

export function clearLegacyWeekCache() {
   removeBrowserStorage("localStorage", "roster-current-week-cache-v2");
   removeBrowserStorage("localStorage", "roster-last-week-cache-v1");
   removeBrowserStorage("sessionStorage", "roster-session-class-diffs-v2");
}

export function clearWeekBrowserCache() {
   clearLegacyWeekCache();
   removeBrowserStorage("localStorage", WEEK_CACHE_KEY);
   removeBrowserStorage("sessionStorage", SESSION_CLASS_DIFFS_KEY);
   removeBrowserStorage("localStorage", "roster-notification-deliveries-v1");
}
