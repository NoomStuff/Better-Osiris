import { useCallback, useEffect, useState } from "react";
import { getClassNotificationPermission, requestNotificationPermission, CLASS_NOTIFICATIONS_STORAGE_KEY } from "../lib/classNotifications";
import { readBrowserStorage, writeBrowserStorage } from "../lib/browserStorage";
import { closeNotifications } from "../lib/notificationDelivery";
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
      window.addEventListener("notificationpreferenceschange", update);
      window.addEventListener("focus", update);
      document.addEventListener("visibilitychange", update);
      return () => {
         window.removeEventListener("storage", update);
         window.removeEventListener("notificationpreferenceschange", update);
         window.removeEventListener("focus", update);
         document.removeEventListener("visibilitychange", update);
      };
   }, [storageKey]);

   const setEnabled = useCallback(
      async (nextEnabled: boolean) => {
         if (!nextEnabled) {
            writeBrowserStorage("localStorage", storageKey, "false");
            const prefix = storageKey === CLASS_NOTIFICATIONS_STORAGE_KEY ? "class-change:" : "class-reminder:";
            void closeNotifications((notification) => notification.tag.startsWith(prefix) && readBrowserStorage("localStorage", storageKey) !== "true");
            window.dispatchEvent(new Event("notificationpreferenceschange"));
            setState((current) => ({ ...current, enabled: false }));
            return;
         }

         setIsUpdating(true);
         try {
            const nextPermission = await requestNotificationPermission();
            const wasEnabled = nextPermission === "granted";
            writeBrowserStorage("localStorage", storageKey, String(wasEnabled));
            window.dispatchEvent(new Event("notificationpreferenceschange"));
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
