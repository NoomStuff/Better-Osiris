import { useEffect, useState } from "react";

const SHORTCUT_ACTIVATION_EVENT = "app-shortcut-activation";
const SHORTCUT_ACTIVE_MS = 160;

interface ShortcutActivationEventDetail {
   id: string;
}

export function triggerShortcutActivation(id: string) {
   window.dispatchEvent(new CustomEvent<ShortcutActivationEventDetail>(SHORTCUT_ACTIVATION_EVENT, { detail: { id } }));
}

export function useShortcutActivation(id: string | undefined) {
   const [isActive, setIsActive] = useState(false);

   useEffect(() => {
      if (!id) {
         return;
      }

      let timer: number | null = null;

      const handleActivation = (event: Event) => {
         if (!(event instanceof CustomEvent) || (event.detail as ShortcutActivationEventDetail | undefined)?.id !== id) {
            return;
         }

         if (timer !== null) {
            window.clearTimeout(timer);
         }

         setIsActive(true);
         timer = window.setTimeout(() => {
            timer = null;
            setIsActive(false);
         }, SHORTCUT_ACTIVE_MS);
      };

      window.addEventListener(SHORTCUT_ACTIVATION_EVENT, handleActivation);

      return () => {
         window.removeEventListener(SHORTCUT_ACTIVATION_EVENT, handleActivation);
         if (timer !== null) {
            window.clearTimeout(timer);
         }
      };
   }, [id]);

   return isActive;
}
