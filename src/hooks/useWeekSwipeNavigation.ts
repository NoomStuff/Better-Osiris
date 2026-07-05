import { useCallback, useEffect, useRef } from "react";

const MIN_DISTANCE_PX = 56;
const MAX_VERTICAL_DRIFT_PX = 72;

interface SwipeStart {
   x: number;
   y: number;
}

export function useWeekSwipeNavigation(enabled: boolean, goPrevious: () => void, goNext: () => void) {
   const startRef = useRef<SwipeStart | null>(null);

   const handleStart = useCallback((event: TouchEvent) => {
      const touch = event.touches.length === 1 ? event.touches[0] : undefined;
      startRef.current = touch ? { x: touch.clientX, y: touch.clientY } : null;
   }, []);

   const handleEnd = useCallback(
      (event: TouchEvent) => {
         const start = startRef.current;
         startRef.current = null;
         const touch = event.changedTouches.length === 1 ? event.changedTouches[0] : undefined;
         if (!start || !touch) return;

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

   useEffect(() => {
      if (!enabled) {
         startRef.current = null;
         return;
      }

      window.addEventListener("touchstart", handleStart, { passive: true });
      window.addEventListener("touchend", handleEnd, { passive: true });
      window.addEventListener("touchcancel", handleCancel, { passive: true });
      return () => {
         window.removeEventListener("touchstart", handleStart);
         window.removeEventListener("touchend", handleEnd);
         window.removeEventListener("touchcancel", handleCancel);
      };
   }, [enabled, handleCancel, handleEnd, handleStart]);
}
