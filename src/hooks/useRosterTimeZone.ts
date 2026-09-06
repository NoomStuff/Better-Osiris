import { useCallback, useEffect, useState } from "react";
import { fetchRosterConfig } from "../api/rosterConfig";
import { getRosterTimeZone, isRosterTimeZoneKnown, setRosterTimeZone } from "../lib/rosterTimeZone";

export function useRosterTimeZone() {
   const [declaredTimeZone, setDeclaredTimeZone] = useState<string | null>(() => (isRosterTimeZoneKnown() ? getRosterTimeZone() : null));
   const [cacheResetKey, setCacheResetKey] = useState(0);
   const [attempt, setAttempt] = useState(0);
   const [configError, setConfigError] = useState<string | null>(null);
   const [isInitialLoading, setIsInitialLoading] = useState(true);
   const retry = useCallback(() => {
      setIsInitialLoading(true);
      setAttempt((value) => value + 1);
   }, []);

   useEffect(() => {
      let stale = false;
      let timer: ReturnType<typeof setTimeout>;
      let delay = 2000;
      const load = async () => {
         try {
            const config = await fetchRosterConfig();
            if (stale) return;
            if (setRosterTimeZone(config.timeZone)) setCacheResetKey((current) => current + 1);
            setDeclaredTimeZone(config.timeZone);
            setConfigError(null);
         } catch (error) {
            if (stale) return;
            setConfigError(error instanceof Error ? error.message : "Roster configuration could not be loaded.");
            timer = setTimeout(() => {
               void load();
            }, delay);
            delay = Math.min(delay * 2, 60_000);
         } finally {
            if (!stale) setIsInitialLoading(false);
         }
      };
      const online = () => {
         clearTimeout(timer);
         void load();
      };
      window.addEventListener("online", online);
      void load();
      return () => {
         stale = true;
         clearTimeout(timer);
         window.removeEventListener("online", online);
      };
   }, [attempt]);

   return { configError, declaredTimeZone, cacheResetKey, isKnown: isRosterTimeZoneKnown(), isInitialLoading, retry };
}
