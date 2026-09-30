import { useCallback, useEffect, useState } from "react";
import { fetchRosterConfig } from "../api/rosterConfig";
import { getRosterTimeZone, isRosterTimeZoneKnown, setRosterTimeZone } from "../lib/rosterTimeZone";

export function useRosterTimeZone() {
   const [declaredTimeZone, setDeclaredTimeZone] = useState<string | null>(() => (isRosterTimeZoneKnown() ? getRosterTimeZone() : null));
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
      let controller: AbortController | undefined;
      const load = async () => {
         controller?.abort();
         const request = new AbortController();
         controller = request;
         try {
            const config = await fetchRosterConfig(request.signal);
            if (stale || request.signal.aborted) return;
            setRosterTimeZone(config.timeZone);
            setDeclaredTimeZone(config.timeZone);
            setConfigError(null);
         } catch (error) {
            if (stale || request.signal.aborted) return;
            setConfigError(error instanceof Error ? error.message : "Roster configuration could not be loaded.");
            timer = setTimeout(() => {
               void load();
            }, delay);
            delay = Math.min(delay * 2, 60_000);
         } finally {
            if (!stale && !request.signal.aborted) setIsInitialLoading(false);
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
         controller?.abort();
         clearTimeout(timer);
         window.removeEventListener("online", online);
      };
   }, [attempt]);

   return { configError, declaredTimeZone, isKnown: isRosterTimeZoneKnown(), isInitialLoading, retry };
}
