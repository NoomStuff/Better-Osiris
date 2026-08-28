import { useEffect, useState } from "react";
import { fetchRosterConfig } from "../api/rosterConfig";
import { getRosterTimeZone, isRosterTimeZoneKnown, setRosterTimeZone } from "../lib/rosterTimeZone";

export function useRosterTimeZone() {
   const [declaredTimeZone, setDeclaredTimeZone] = useState<string | null>(() => (isRosterTimeZoneKnown() ? getRosterTimeZone() : null));
   const [hasTimeZoneChanged, setHasTimeZoneChanged] = useState(false);
   const [configError, setConfigError] = useState<string | null>(null);
   const [isInitialLoading, setIsInitialLoading] = useState(true);

   useEffect(() => {
      let isStale = false;

      fetchRosterConfig()
         .then((config) => {
            if (isStale) {
               return;
            }

            if (setRosterTimeZone(config.timeZone)) {
               // Cached roster data was hydrated under a different zone and is now untrustworthy.
               setHasTimeZoneChanged(true);
            }
            setDeclaredTimeZone(config.timeZone);
         })
         .catch((error: unknown) => {
            if (!isStale) {
               setConfigError(error instanceof Error ? error.message : "The roster configuration could not be loaded.");
            }
         })
         .finally(() => {
            if (!isStale) {
               setIsInitialLoading(false);
            }
         });

      return () => {
         isStale = true;
      };
   }, []);

   return {
      configError,
      declaredTimeZone,
      hasTimeZoneChanged,
      isKnown: isRosterTimeZoneKnown(),
      isInitialLoading,
   };
}
