import { useCallback, useEffect, useRef, useState } from "react";
import { haptic } from "../lib/haptics";

/** Keep the controlled panel mounted until its 220 ms closing animation finishes. */
export const PANEL_CLOSE_MS = 240;

export function usePanelClose(identity: string | boolean | null, onClose: () => void) {
   const [isClosing, setIsClosing] = useState(false);
   const [seenIdentity, setSeenIdentity] = useState(identity);
   const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
   if (seenIdentity !== identity) {
      setSeenIdentity(identity);
      setIsClosing(false);
   }
   useEffect(() => () => clearTimeout(timer.current), [identity]);
   const close = useCallback(() => {
      if (isClosing) return;
      setIsClosing(true);
      haptic();
      timer.current = setTimeout(() => {
         setIsClosing(false);
         onClose();
      }, PANEL_CLOSE_MS);
   }, [isClosing, onClose]);
   return { isClosing, close };
}
