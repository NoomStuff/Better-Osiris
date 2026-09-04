import { useCallback, useEffect, useState } from "react";
import { clearOsirisToken, fetchOsirisTokenSettings, saveOsirisToken, type OsirisTokenSettings } from "../api/settings";
import { clearWeekBrowserCache } from "../lib/weekCache";

const INITIAL_SETTINGS_RETRY_DELAY_MS = 250;
const MAX_SETTINGS_RETRY_DELAY_MS = 5_000;

export function useOsirisTokenSettings() {
   const [settings, setSettings] = useState<OsirisTokenSettings | null>(null);
   const [isInitialLoading, setIsInitialLoading] = useState(true);
   const [initialLoadError, setInitialLoadError] = useState<string | null>(null);
   const [isMutating, setIsMutating] = useState(false);
   const [weeksResetKey, setRosterResetKey] = useState(0);

   const applySettings = useCallback((next: OsirisTokenSettings) => {
      clearWeekBrowserCache();
      setSettings(next);
      setRosterResetKey((current) => current + 1);
      return next;
   }, []);

   useEffect(() => {
      let isStale = false;
      let retryTimerId: number | null = null;
      let retryDelayMs = INITIAL_SETTINGS_RETRY_DELAY_MS;

      const loadSettings = () => {
         void fetchOsirisTokenSettings()
            .then((next) => {
               if (isStale) {
                  return;
               }

               if (!next.hasBearerToken) {
                  clearWeekBrowserCache();
               }
               setSettings(next);
               setInitialLoadError(null);
               setIsInitialLoading(false);
            })
            .catch((error: unknown) => {
               if (isStale) {
                  return;
               }

               setInitialLoadError(error instanceof Error ? error.message : "Bearer token settings could not be loaded.");
               retryTimerId = window.setTimeout(loadSettings, retryDelayMs);
               retryDelayMs = Math.min(retryDelayMs * 2, MAX_SETTINGS_RETRY_DELAY_MS);
            });
      };

      loadSettings();

      return () => {
         isStale = true;
         if (retryTimerId !== null) {
            window.clearTimeout(retryTimerId);
         }
      };
   }, []);

   const refreshAfterAuthError = useCallback(async () => {
      try {
         setSettings(await fetchOsirisTokenSettings());
      } catch {
         setSettings((current) => {
            const next = current ? { ...current, hasCustomToken: false } : current;
            if (next && !next.hasBearerToken) {
               clearWeekBrowserCache();
            }
            return next;
         });
      }
   }, []);

   const saveToken = useCallback(
      async (token: string) => {
         setIsMutating(true);
         try {
            return applySettings(await saveOsirisToken(token));
         } finally {
            setIsMutating(false);
         }
      },
      [applySettings]
   );

   const clearToken = useCallback(async () => {
      setIsMutating(true);
      try {
         return applySettings(await clearOsirisToken());
      } finally {
         setIsMutating(false);
      }
   }, [applySettings]);

   return {
      settings,
      hasBearerToken: settings?.hasBearerToken === true,
      isInitialLoading,
      initialLoadError,
      isMutating,
      weeksResetKey,
      saveToken,
      clearToken,
      refreshAfterAuthError,
   };
}
