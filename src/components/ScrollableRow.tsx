import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import "./ScrollableRow.css";

interface ScrollableRowProps {
   children: ReactNode;
}

/* Horizontal scroller for rows that may not fit their container: never shows a scrollbar,
   fades the content toward an edge that has more to scroll into, and offers arrow buttons
   on pointer devices. */
export function ScrollableRow({ children }: ScrollableRowProps) {
   const scrollerRef = useRef<HTMLDivElement | null>(null);
   const [canScrollStart, setCanScrollStart] = useState(false);
   const [canScrollEnd, setCanScrollEnd] = useState(false);

   const updateEdges = useCallback(() => {
      const scroller = scrollerRef.current;
      if (!scroller) {
         return;
      }

      const maxScroll = scroller.scrollWidth - scroller.clientWidth;
      setCanScrollStart(scroller.scrollLeft > 1);
      setCanScrollEnd(scroller.scrollLeft < maxScroll - 1);
   }, []);

   useEffect(() => {
      const scroller = scrollerRef.current;
      if (!scroller) {
         return;
      }

      updateEdges();
      const observer = new ResizeObserver(updateEdges);
      observer.observe(scroller);
      return () => observer.disconnect();
   }, [updateEdges]);

   const nudge = (direction: -1 | 1) => {
      const scroller = scrollerRef.current;
      if (!scroller) {
         return;
      }

      const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      scroller.scrollBy({ left: direction * scroller.clientWidth * 0.8, behavior: prefersReducedMotion ? "auto" : "smooth" });
   };

   return (
      <div className="scrollable-row">
         <div
            ref={scrollerRef}
            className="scrollable-row__scroller"
            data-fade-start={canScrollStart || undefined}
            data-fade-end={canScrollEnd || undefined}
            onScroll={updateEdges}
         >
            {children}
         </div>
         {canScrollStart ? (
            <button type="button" className="scrollable-row__arrow scrollable-row__arrow--start" aria-label="Scroll back" onClick={() => nudge(-1)}>
               <i className="fa-solid fa-chevron-left" aria-hidden="true" />
            </button>
         ) : null}
         {canScrollEnd ? (
            <button type="button" className="scrollable-row__arrow scrollable-row__arrow--end" aria-label="Scroll forward" onClick={() => nudge(1)}>
               <i className="fa-solid fa-chevron-right" aria-hidden="true" />
            </button>
         ) : null}
      </div>
   );
}
