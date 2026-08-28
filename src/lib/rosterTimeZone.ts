import { isValidTimeZone, resolveCanonicalTimeZone } from "../../shared/timeZone";
import { readBrowserStorage, writeBrowserStorage } from "./browserStorage";

export const ROSTER_TIME_ZONE_STORAGE_KEY = "roster-time-zone-v1";

let currentTimeZone: string | null = readStoredTimeZone();

function readStoredTimeZone() {
   const stored = readBrowserStorage("localStorage", ROSTER_TIME_ZONE_STORAGE_KEY);
   if (!stored || !isValidTimeZone(stored)) {
      return null;
   }
   return resolveCanonicalTimeZone(stored);
}

export function isRosterTimeZoneKnown() {
   return currentTimeZone !== null;
}

/**
 * The IANA time zone every timezone-less roster wall time is expressed in. It is declared by the
 * server with the roster data, so the client never assumes a zone of its own.
 */
export function getRosterTimeZone() {
   if (!currentTimeZone) {
      throw new Error("The roster time zone has not been received from the server yet.");
   }
   return currentTimeZone;
}

/**
 * Adopts the server-declared roster time zone and persists it for the next boot.
 * Returns true when it differs from the previously known zone, meaning cached roster data
 * was interpreted under a different zone and must be discarded.
 */
export function setRosterTimeZone(timeZone: string) {
   if (!isValidTimeZone(timeZone)) {
      throw new Error(`"${timeZone}" is not a valid IANA time zone.`);
   }

   const canonicalZone = resolveCanonicalTimeZone(timeZone);
   const previousZone = currentTimeZone;
   currentTimeZone = canonicalZone;
   writeBrowserStorage("localStorage", ROSTER_TIME_ZONE_STORAGE_KEY, canonicalZone);
   return previousZone !== null && previousZone !== canonicalZone;
}
