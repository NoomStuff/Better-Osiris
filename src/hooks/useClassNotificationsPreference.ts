import { useCallback, useEffect, useState } from "react";
import {
   getClassNotificationPermission,
   getClassNotificationsEnabled,
   requestNotificationPermission,
   setClassNotificationsEnabled,
} from "../lib/classNotifications";
import { notifyWarning } from "../lib/notyf";

function getInitialState() {
   const permission = getClassNotificationPermission();
   return {
      enabled: getClassNotificationsEnabled() && permission === "granted",
      permission,
   };
}

export function useClassNotificationsPreference() {
   const [{ enabled, permission }, setState] = useState(getInitialState);
   const [isUpdating, setIsUpdating] = useState(false);

   useEffect(() => {
      if (!enabled && getClassNotificationsEnabled()) {
         setClassNotificationsEnabled(false);
      }
   }, [enabled]);

   const setEnabled = useCallback(async (nextEnabled: boolean) => {
      if (!nextEnabled) {
         setClassNotificationsEnabled(false);
         setState((current) => ({ ...current, enabled: false }));
         return;
      }

      setIsUpdating(true);
      try {
         const nextPermission = await requestNotificationPermission();
         const wasEnabled = nextPermission === "granted";
         setClassNotificationsEnabled(wasEnabled);
         setState({ enabled: wasEnabled, permission: nextPermission });

         if (!wasEnabled) {
            notifyWarning(nextPermission === "denied" ? "Notifications are blocked in your browser settings." : "Notifications were not enabled.");
         }
      } finally {
         setIsUpdating(false);
      }
   }, []);

   return {
      enabled,
      isBlocked: permission === "denied",
      isSupported: permission !== "unsupported",
      isUpdating,
      permission,
      setEnabled,
   };
}
