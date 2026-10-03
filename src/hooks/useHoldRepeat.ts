import { useEffect, useLayoutEffect, useRef } from "react";
import type { MouseEvent, PointerEvent } from "react";

const HOLD_REPEAT_DELAY_MS = 500;
const HOLD_REPEAT_INTERVAL_MS = 150;

export interface HoldRepeatHandlers {
   onPointerDown: (event: PointerEvent<HTMLElement>) => void;
   onPointerMove: (event: PointerEvent<HTMLElement>) => void;
   onPointerUp: (event: PointerEvent<HTMLElement>) => void;
   onPointerCancel: (event: PointerEvent<HTMLElement>) => void;
   onPointerLeave: (event: PointerEvent<HTMLElement>) => void;
   onClick: (event: MouseEvent<HTMLElement>) => void;
   onContextMenu: (event: MouseEvent<HTMLElement>) => void;
}

/**
 * Press-and-hold repeat for a pointer-driven button, on the same cadence as keyboard hold:
 * first action immediately, repeats after 500 ms then every 150 ms while held. A mouse press
 * fires on pointerdown; a touch press fires on release like a native tap unless the hold
 * already started repeating, so a gesture the browser cancels (scrolling away) stays a no-op.
 * Repeats deliberately bypass the shortcut activation flash: the keyboard hold lights the
 * button up because the finger is elsewhere, while a held pointer is already sitting on it.
 */
export function useHoldRepeat(onFire: () => void): HoldRepeatHandlers {
   const onFireRef = useRef(onFire);
   useLayoutEffect(() => {
      onFireRef.current = onFire;
   });

   const repeatTimeout = useRef<number | undefined>(undefined);
   const heldPointerId = useRef<number | null>(null);
   const hasFired = useRef(false);

   useEffect(() => () => window.clearTimeout(repeatTimeout.current), []);

   const stopRepeat = () => {
      window.clearTimeout(repeatTimeout.current);
      repeatTimeout.current = undefined;
      heldPointerId.current = null;
   };

   const scheduleRepeat = (delay: number) => {
      repeatTimeout.current = window.setTimeout(() => {
         repeatTimeout.current = undefined;
         if (heldPointerId.current === null) {
            return;
         }
         hasFired.current = true;
         onFireRef.current();
         scheduleRepeat(HOLD_REPEAT_INTERVAL_MS);
      }, delay);
   };

   const isOverButton = (event: PointerEvent<HTMLElement>) => {
      const rect = event.currentTarget.getBoundingClientRect();
      return event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom;
   };

   const fireOnce = () => {
      hasFired.current = true;
      onFireRef.current();
   };

   const handlePointerDown = (event: PointerEvent<HTMLElement>) => {
      if (!event.isPrimary || (event.pointerType === "mouse" && event.button !== 0)) {
         return;
      }
      stopRepeat();
      heldPointerId.current = event.pointerId;
      hasFired.current = false;
      if (event.pointerType === "mouse") {
         fireOnce();
         scheduleRepeat(HOLD_REPEAT_DELAY_MS);
         return;
      }
      // Touch keeps implicit pointer capture, so the release still lands here even if the
      // finger slid off; the action waits for that release to stay clear of scroll gestures.
      scheduleRepeat(HOLD_REPEAT_DELAY_MS);
   };

   const handlePointerMove = (event: PointerEvent<HTMLElement>) => {
      if (heldPointerId.current !== event.pointerId || isOverButton(event)) {
         return;
      }
      stopRepeat();
   };

   const handlePointerUp = (event: PointerEvent<HTMLElement>) => {
      if (heldPointerId.current !== event.pointerId) {
         return;
      }
      const shouldFire = !hasFired.current && isOverButton(event);
      stopRepeat();
      if (shouldFire) {
         fireOnce();
      }
   };

   const handlePointerCancel = (event: PointerEvent<HTMLElement>) => {
      if (heldPointerId.current === event.pointerId) {
         stopRepeat();
      }
   };

   const handlePointerLeave = (event: PointerEvent<HTMLElement>) => {
      if (heldPointerId.current === null || heldPointerId.current === event.pointerId) {
         stopRepeat();
      }
   };

   const handleClick = (event: MouseEvent<HTMLElement>) => {
      // Pointer presses already activated on down or up; keyboard and assistive activation
      // arrive as a click without a pointer sequence, which reports detail 0.
      if (event.detail > 0) {
         return;
      }
      onFireRef.current();
   };

   const handleContextMenu = (event: MouseEvent<HTMLElement>) => {
      // Holding a finger on the button is a repeat gesture, not a request for the long-press menu.
      if (heldPointerId.current !== null) {
         event.preventDefault();
      }
   };

   return {
      onPointerDown: handlePointerDown,
      onPointerMove: handlePointerMove,
      onPointerUp: handlePointerUp,
      onPointerCancel: handlePointerCancel,
      onPointerLeave: handlePointerLeave,
      onClick: handleClick,
      onContextMenu: handleContextMenu,
   };
}
