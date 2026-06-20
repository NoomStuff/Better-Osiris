import { useCallback, useEffect, useRef, useState } from "react";

const TOOLTIP_DELAY_MS = 1000;
const TOOLTIP_WARM_WINDOW_MS = 1000;
const MOBILE_TOOLTIP_MEDIA_QUERY = "(hover: none), (pointer: coarse), (max-width: 767px)";

let lastTooltipClosedAt = Number.NEGATIVE_INFINITY;

interface DelayedTooltipOptions {
   disabled?: boolean | undefined;
   enabled?: boolean | undefined;
}

export function useDelayedTooltip({ disabled = false, enabled = true }: DelayedTooltipOptions = {}) {
   const timerRef = useRef<number | null>(null);
   const isTooltipOpenRef = useRef(false);
   const [isTooltipOpen, setIsTooltipOpen] = useState(false);
   const [isMobileTooltipContext, setIsMobileTooltipContext] = useState(() => {
      if (typeof window === "undefined") {
         return false;
      }

      return window.matchMedia(MOBILE_TOOLTIP_MEDIA_QUERY).matches;
   });

   const isTooltipEnabled = enabled && !disabled && !isMobileTooltipContext;
   const isTooltipEnabledRef = useRef(isTooltipEnabled);

   const clearTooltipTimer = useCallback(() => {
      if (timerRef.current === null) {
         return;
      }

      window.clearTimeout(timerRef.current);
      timerRef.current = null;
   }, []);

   const hideTooltip = useCallback(() => {
      clearTooltipTimer();
      if (isTooltipOpenRef.current) {
         lastTooltipClosedAt = performance.now();
      }

      isTooltipOpenRef.current = false;
      setIsTooltipOpen(false);
   }, [clearTooltipTimer]);

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

   useEffect(() => {
      isTooltipEnabledRef.current = isTooltipEnabled;
   }, [isTooltipEnabled]);

   useEffect(() => {
      const mediaQuery = window.matchMedia(MOBILE_TOOLTIP_MEDIA_QUERY);

      const handleMediaChange = () => {
         const isMobile = mediaQuery.matches;
         setIsMobileTooltipContext(isMobile);

         if (isMobile) {
            hideTooltip();
         }
      };

      mediaQuery.addEventListener("change", handleMediaChange);

      return () => {
         mediaQuery.removeEventListener("change", handleMediaChange);
      };
   }, [hideTooltip]);

   const showTooltip = useCallback(() => {
      if (!isTooltipEnabled || isTooltipOpenRef.current) {
         return;
      }

      clearTooltipTimer();
      const elapsedSinceClose = performance.now() - lastTooltipClosedAt;
      const delay = elapsedSinceClose <= TOOLTIP_WARM_WINDOW_MS ? 0 : TOOLTIP_DELAY_MS;

      timerRef.current = window.setTimeout(() => {
         timerRef.current = null;
         if (!isTooltipEnabledRef.current) {
            return;
         }

         isTooltipOpenRef.current = true;
         setIsTooltipOpen(true);
      }, delay);
   }, [clearTooltipTimer, isTooltipEnabled]);

   return {
      hideTooltip,
      isTooltipEnabled,
      isTooltipOpen: isTooltipEnabled && isTooltipOpen,
      showTooltip,
   };
}
