import { useCallback, useLayoutEffect, useRef, type RefObject } from "react";

const MIN_DISTANCE_PX = 56;
const MAX_VERTICAL_DRIFT_PX = 72;

interface SwipeStart {
   identifier: number;
   x: number;
   y: number;
}

export function useWeekSwipeNavigation(regionRef: RefObject<HTMLElement | null>, enabled: boolean, goPrevious: () => void, goNext: () => void) {
   const startRef = useRef<SwipeStart | null>(null);

   const handleStart = useCallback((event: TouchEvent) => {
      const target = event.target;
      if (!(target instanceof Element) || target.closest('input, textarea, select, [contenteditable="true"], [role="slider"], .next-up')) {
         startRef.current = null;
         return;
      }
      const touch = event.touches.length === 1 ? event.touches[0] : undefined;
      startRef.current = touch ? { identifier: touch.identifier, x: touch.clientX, y: touch.clientY } : null;
   }, []);

   const handleEnd = useCallback(
      (event: TouchEvent) => {
         const start = startRef.current;
         startRef.current = null;
         const touch = event.changedTouches.length === 1 ? event.changedTouches[0] : undefined;
         if (!start || start.identifier !== touch?.identifier) return;

         const deltaX = touch.clientX - start.x;
         const deltaY = touch.clientY - start.y;
         const absX = Math.abs(deltaX);
         const absY = Math.abs(deltaY);
         if (absX < MIN_DISTANCE_PX || absY > MAX_VERTICAL_DRIFT_PX || absX < absY * 1.2) return;

         if (deltaX < 0) goNext();
         else goPrevious();
      },
      [goNext, goPrevious]
   );

   const handleCancel = useCallback(() => {
      startRef.current = null;
   }, []);

   const handleMove = useCallback((event: TouchEvent) => {
      const start = startRef.current;
      const touch = event.touches.length === 1 ? event.touches[0] : undefined;
      if (!start) return;
      if (touch?.identifier !== start.identifier) {
         startRef.current = null;
         return;
      }
      const vertical = Math.abs(touch.clientY - start.y);
      if (vertical > 12 && vertical > Math.abs(touch.clientX - start.x)) startRef.current = null;
   }, []);

   useLayoutEffect(() => {
      if (!enabled) {
         startRef.current = null;
         return;
      }

      const region = regionRef.current;
      if (!region) return;
      region.addEventListener("touchstart", handleStart, { passive: true });
      region.addEventListener("touchmove", handleMove, { passive: true });
      region.addEventListener("touchend", handleEnd, { passive: true });
      region.addEventListener("touchcancel", handleCancel, { passive: true });
      return () => {
         startRef.current = null;
         region.removeEventListener("touchstart", handleStart);
         region.removeEventListener("touchmove", handleMove);
         region.removeEventListener("touchend", handleEnd);
         region.removeEventListener("touchcancel", handleCancel);
      };
   }, [enabled, handleCancel, handleEnd, handleMove, handleStart, regionRef]);
}
