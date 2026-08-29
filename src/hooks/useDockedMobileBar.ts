import { useEffect, useState, type RefObject } from "react";

// The bar docks once the content's bottom edge has scrolled within ~100px of the viewport
// bottom, i.e. when almost nothing is left sliding underneath the bar. The buffer before
// the exact overlap boundary keeps the state from flapping while parked at the page bottom.
const DOCK_VIEWPORT_INSET = 100;

export function useDockedMobileBar(contentRef: RefObject<HTMLElement | null>) {
   const [isDocked, setIsDocked] = useState(false);

   useEffect(() => {
      const content = contentRef.current;
      if (!content) {
         return;
      }

      let frame: number | null = null;

      const update = () => {
         frame = null;
         setIsDocked(content.getBoundingClientRect().bottom <= window.innerHeight - DOCK_VIEWPORT_INSET);
      };

      const scheduleUpdate = () => {
         frame ??= requestAnimationFrame(update);
      };

      const resizeObserver = new ResizeObserver(scheduleUpdate);
      resizeObserver.observe(content);
      window.addEventListener("scroll", scheduleUpdate, { passive: true });
      window.addEventListener("resize", scheduleUpdate);

      return () => {
         resizeObserver.disconnect();
         window.removeEventListener("scroll", scheduleUpdate);
         window.removeEventListener("resize", scheduleUpdate);
         if (frame !== null) {
            cancelAnimationFrame(frame);
         }
      };
   }, [contentRef]);

   return isDocked;
}
