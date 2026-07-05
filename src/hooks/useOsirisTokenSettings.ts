import { useCallback, useEffect, useState } from "react";
import { clearOsirisToken, fetchOsirisTokenSettings, saveOsirisToken, type OsirisTokenSettings } from "../api/settings";
import { notifyError } from "../lib/notyf";
import { clearRosterBrowserCache } from "../lib/rosterCache";

export function useOsirisTokenSettings() {
   const [settings, setSettings] = useState<OsirisTokenSettings | null>(null);
   const [isInitialLoading, setIsInitialLoading] = useState(true);
   const [isMutating, setIsMutating] = useState(false);
   const [rosterResetKey, setRosterResetKey] = useState(0);

   const applySettings = useCallback((next: OsirisTokenSettings) => {
      clearRosterBrowserCache();
      setSettings(next);
      setRosterResetKey((current) => current + 1);
      return next;
   }, []);

   useEffect(() => {
      let isStale = false;

      fetchOsirisTokenSettings()
         .then((next) => {
            if (!isStale) {
               if (!next.hasBearerToken) {
                  clearRosterBrowserCache();
               }
               setSettings(next);
            }
         })
         .catch((error: unknown) => {
            if (!isStale) {
               clearRosterBrowserCache();
               setSettings({ hasCustomToken: false, hasBearerToken: false });
               notifyError(error, "Failed to load bearer token settings.");
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

   const refreshAfterAuthError = useCallback(async () => {
      try {
         setSettings(await fetchOsirisTokenSettings());
      } catch {
         setSettings((current) => {
            const next = current ? { ...current, hasCustomToken: false } : current;
            if (next && !next.hasBearerToken) {
               clearRosterBrowserCache();
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
      isMutating,
      rosterResetKey,
      saveToken,
      clearToken,
      refreshAfterAuthError,
   };
}
