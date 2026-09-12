import { useCallback, useEffect, useState } from "react";
import { getClassNotificationPermission, requestNotificationPermission, CLASS_NOTIFICATIONS_STORAGE_KEY } from "../lib/classNotifications";
import { readBrowserStorage, writeBrowserStorage } from "../lib/browserStorage";
import { notifyWarning } from "../lib/notyf";

function getInitialState(storageKey: string) {
   const permission = getClassNotificationPermission();
   return {
      enabled: readBrowserStorage("localStorage", storageKey) === "true" && permission === "granted",
      permission,
   };
}

export function useClassNotificationsPreference(storageKey = CLASS_NOTIFICATIONS_STORAGE_KEY) {
   const [{ enabled, permission }, setState] = useState(() => getInitialState(storageKey));
   const [isUpdating, setIsUpdating] = useState(false);

   useEffect(() => {
      const update = () => setState(getInitialState(storageKey));
      window.addEventListener("storage", update);
      document.addEventListener("visibilitychange", update);
      return () => {
         window.removeEventListener("storage", update);
         document.removeEventListener("visibilitychange", update);
      };
   }, [storageKey]);

   const setEnabled = useCallback(
      async (nextEnabled: boolean) => {
         if (!nextEnabled) {
            writeBrowserStorage("localStorage", storageKey, "false");
            setState((current) => ({ ...current, enabled: false }));
            return;
         }

         setIsUpdating(true);
         try {
            const nextPermission = await requestNotificationPermission();
            const wasEnabled = nextPermission === "granted";
            writeBrowserStorage("localStorage", storageKey, String(wasEnabled));
            setState({ enabled: wasEnabled, permission: nextPermission });

            if (!wasEnabled) {
               notifyWarning(nextPermission === "denied" ? "Notifications are blocked in your browser settings." : "Notifications were not enabled.");
            }
         } finally {
            setIsUpdating(false);
         }
      },
      [storageKey]
   );

   return {
      enabled,
      isBlocked: permission === "denied",
      isSupported: permission !== "unsupported",
      isUpdating,
      permission,
      setEnabled,
   };
}
