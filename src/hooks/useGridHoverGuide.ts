import { useEffect, useRef, type MouseEvent } from "react";
import { clamp } from "../lib/clamp";
import { formatClock } from "../lib/date";
import type { GridHourRange } from "../lib/gridHours";

/** Per-second rate of the hover guide's chase toward the cursor; about 95% of the way in 170ms. */
const GUIDE_CHASE_RATE = 18;
/** How close the hover guide must be to its target, in percent of the grid height, to count as arrived. */
const GUIDE_SETTLE_PERCENT = 0.01;

export function useGridHoverGuide(hours: GridHourRange) {
   const startMinutes = hours[0] * 60;
   const endMinutes = hours[1] * 60;
   const shownMinutes = endMinutes - startMinutes;
   const guideElementRef = useRef<HTMLDivElement | null>(null);
   const guideLabelRef = useRef<HTMLSpanElement | null>(null);
   const guideMotion = useRef({ top: 0, target: 0, visible: false, frame: 0, lastTime: 0 });
   useEffect(() => () => cancelAnimationFrame(guideMotion.current.frame), []);
   const renderGuide = () => {
      const motion = guideMotion.current;
      const element = guideElementRef.current;
      if (!element) {
         return;
      }
      element.style.top = `${motion.top}%`;
      if (guideLabelRef.current) {
         const minutes = clamp(Math.round(startMinutes + (motion.top / 100) * shownMinutes), startMinutes, endMinutes);
         guideLabelRef.current.textContent = formatClock(minutes);
      }
   };

   const stepGuide = (time: number) => {
      const motion = guideMotion.current;
      motion.frame = 0;
      if (!motion.lastTime) {
         motion.lastTime = time;
      }
      const delta = Math.min((time - motion.lastTime) / 1000, 0.1);
      motion.lastTime = time;
      motion.top += (motion.target - motion.top) * (1 - Math.exp(-GUIDE_CHASE_RATE * delta));
      if (Math.abs(motion.target - motion.top) < GUIDE_SETTLE_PERCENT) {
         motion.top = motion.target;
      }
      renderGuide();
      if (motion.top !== motion.target) {
         motion.frame = requestAnimationFrame(stepGuide);
      }
   };

   const animateGuide = () => {
      const motion = guideMotion.current;
      if (motion.frame) {
         return;
      }
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
         motion.top = motion.target;
         renderGuide();
         return;
      }
      motion.lastTime = 0;
      motion.frame = requestAnimationFrame(stepGuide);
   };

   const updateHoverGuide = (event: MouseEvent<HTMLDivElement>) => {
      const rect = event.currentTarget.getBoundingClientRect();
      const height = event.currentTarget.clientHeight;
      const y = clamp(event.clientY - rect.top, 0, height);
      const minutes = clamp(Math.round(startMinutes + (y / height) * shownMinutes), startMinutes, endMinutes);
      const motion = guideMotion.current;
      motion.target = ((minutes - startMinutes) / shownMinutes) * 100;

      if (!motion.visible) {
         motion.visible = true;
         motion.top = motion.target;
         guideElementRef.current?.style.setProperty("opacity", "1");
      }

      if (motion.top !== motion.target) {
         animateGuide();
      } else {
         renderGuide();
      }
   };

   const clearHoverGuide = () => {
      const motion = guideMotion.current;
      if (!motion.visible) {
         return;
      }
      motion.visible = false;
      guideElementRef.current?.style.setProperty("opacity", "0");
      if (motion.frame) {
         cancelAnimationFrame(motion.frame);
         motion.frame = 0;
      }
   };

   return { guideElementRef, guideLabelRef, updateHoverGuide, clearHoverGuide };
}
