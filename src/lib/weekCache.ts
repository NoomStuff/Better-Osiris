import { removeBrowserStorage } from "./browserStorage";
import { NOTIFICATION_DELIVERY_LEDGER_KEY } from "./notificationDelivery";

export const WEEK_CACHE_KEY = "roster-weeks-v3";
export const SESSION_CLASS_DIFFS_KEY = "roster-session-class-diffs-v3";

export function clearWeekBrowserCache() {
   removeBrowserStorage("localStorage", WEEK_CACHE_KEY);
   removeBrowserStorage("sessionStorage", SESSION_CLASS_DIFFS_KEY);
   removeBrowserStorage("localStorage", NOTIFICATION_DELIVERY_LEDGER_KEY);
}
