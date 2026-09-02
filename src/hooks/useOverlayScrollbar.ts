import { useCallback, useRef } from "react";
import { attachOverlayScrollbar } from "../lib/overlayScrollbar";

/* Attaches an overlay scrollbar to the referenced element for as long as it is mounted.
   This is a callback ref so containers that only render conditionally (a closed dialog)
   get their scrollbar when they appear, not when the component first mounts. */
export function useOverlayScrollbar() {
   const cleanupRef = useRef<(() => void) | null>(null);

   return useCallback((element: HTMLElement | null) => {
      cleanupRef.current?.();
      cleanupRef.current = element ? attachOverlayScrollbar(element) : null;
   }, []);
}
