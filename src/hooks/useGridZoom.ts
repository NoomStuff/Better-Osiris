import { useCallback, useEffect, useState, type TransitionEvent } from "react";
import type { GridZoom, ViewMode } from "../types/weeks";

export function useGridZoom(viewMode: ViewMode) {
   const [gridZoom, setGridZoom] = useState<GridZoom>("hour");
   const [animateGridHeight, setAnimateGridHeight] = useState(false);
   const changeGridZoom = useCallback(
      (nextZoom: GridZoom) => {
         // Batched with the zoom update so the height transition is present
         // on the same render that changes the height. Setting the flag in
         // an effect would run after paint, after the height already snapped.
         if (nextZoom !== gridZoom && viewMode === "grid") {
            setAnimateGridHeight(true);
         }
         setGridZoom(nextZoom);
      },
      [gridZoom, viewMode]
   );

   useEffect(() => {
      if (!animateGridHeight) {
         return;
      }
      const timer = window.setTimeout(() => setAnimateGridHeight(false), 480);
      return () => window.clearTimeout(timer);
   }, [animateGridHeight]);

   const handleGridHeightTransitionEnd = useCallback((event: TransitionEvent<HTMLElement>) => {
      if (event.currentTarget !== event.target) {
         return;
      }
      if (event.propertyName && event.propertyName !== "height") {
         return;
      }
      setAnimateGridHeight(false);
   }, []);

   return { gridZoom, animateGridHeight, changeGridZoom, handleGridHeightTransitionEnd };
}
