import { useEffect, useRef, useState } from "react";

const TOOLTIP_DELAY_MS = 1000;
const TOOLTIP_WARM_WINDOW_MS = 1000;

let lastTooltipClosedAt = Number.NEGATIVE_INFINITY;

interface DelayedTooltipOptions {
   disabled?: boolean | undefined;
   enabled?: boolean | undefined;
}

export function useDelayedTooltip({ disabled = false, enabled = true }: DelayedTooltipOptions = {}) {
   const timerRef = useRef<number | null>(null);
   const isTooltipOpenRef = useRef(false);
   const [isTooltipOpen, setIsTooltipOpen] = useState(false);

   useEffect(() => {
      return () => {
         if (timerRef.current !== null) {
            window.clearTimeout(timerRef.current);
         }

         if (isTooltipOpenRef.current) {
            lastTooltipClosedAt = performance.now();
            isTooltipOpenRef.current = false;
         }
      };
   }, []);

   const clearTooltipTimer = () => {
      if (timerRef.current === null) {
         return;
      }

      window.clearTimeout(timerRef.current);
      timerRef.current = null;
   };

   const showTooltip = () => {
      if (!enabled || disabled || isTooltipOpenRef.current) {
         return;
      }

      clearTooltipTimer();
      const elapsedSinceClose = performance.now() - lastTooltipClosedAt;
      const delay = elapsedSinceClose <= TOOLTIP_WARM_WINDOW_MS ? 0 : TOOLTIP_DELAY_MS;

      timerRef.current = window.setTimeout(() => {
         timerRef.current = null;
         isTooltipOpenRef.current = true;
         setIsTooltipOpen(true);
      }, delay);
   };

   const hideTooltip = () => {
      clearTooltipTimer();
      if (isTooltipOpenRef.current) {
         lastTooltipClosedAt = performance.now();
      }

      isTooltipOpenRef.current = false;
      setIsTooltipOpen(false);
   };

   return {
      hideTooltip,
      isTooltipOpen,
      showTooltip,
   };
}
