import {
   useEffect,
   useId,
   useRef,
   type HTMLAttributes,
   type KeyboardEvent as ReactKeyboardEvent,
   type ReactNode,
   type RefObject,
   type TouchEvent,
} from "react";
import "./OverlayPanel.css";

const overlayStack: string[] = [];
let bodyLockCount = 0;
let originalBodyOverflow = "";
let originalBodyOverscrollBehavior = "";

const FOCUSABLE_SELECTOR = [
   "a[href]",
   "button:not([disabled])",
   "input:not([disabled])",
   "select:not([disabled])",
   "textarea:not([disabled])",
   '[tabindex]:not([tabindex="-1"])',
].join(",");

interface OverlayPanelProps {
   children: ReactNode;
   className?: string;
   surfaceClassName?: string;
   backdropClassName?: string;
   closeLabel: string;
   labelledBy?: string;
   label?: string;
   placement?: "center" | "bottom";
   isClosing?: boolean;
   closeOnEscape?: boolean;
   closeOnSwipeDown?: boolean;
   swipeIgnoreSelector?: string;
   onClose: () => void;
   rootProps?: HTMLAttributes<HTMLDivElement>;
   surfaceProps?: HTMLAttributes<HTMLElement>;
}

export function OverlayPanel({
   children,
   className,
   surfaceClassName,
   backdropClassName,
   closeLabel,
   labelledBy,
   label,
   placement = "center",
   isClosing = false,
   closeOnEscape = true,
   closeOnSwipeDown = false,
   swipeIgnoreSelector,
   onClose,
   rootProps,
   surfaceProps,
}: OverlayPanelProps) {
   const overlayId = useId();
   const surfaceRef = useRef<HTMLElement | null>(null);
   const touchStartYRef = useRef<number | null>(null);
   useOverlayLifecycle(overlayId, surfaceRef, closeOnEscape, onClose);
   useLockedBodyScroll();

   const rootClassName = ["overlay-panel", `overlay-panel--${placement}`, className, rootProps?.className].filter(Boolean).join(" ");
   const backdropClassNames = ["overlay-panel__backdrop", backdropClassName].filter(Boolean).join(" ");
   const surfaceClassNames = ["overlay-panel__surface", surfaceClassName, surfaceProps?.className].filter(Boolean).join(" ");

   const handleTouchStart = (event: TouchEvent<HTMLDivElement>) => {
      rootProps?.onTouchStart?.(event);

      if (!closeOnSwipeDown) {
         return;
      }

      if (isSwipeIgnored(event.target, swipeIgnoreSelector)) {
         touchStartYRef.current = null;
         return;
      }

      touchStartYRef.current = event.touches[0]?.clientY ?? null;
   };

   const handleTouchEnd = (event: TouchEvent<HTMLDivElement>) => {
      rootProps?.onTouchEnd?.(event);

      if (!closeOnSwipeDown) {
         return;
      }

      if (isSwipeIgnored(event.target, swipeIgnoreSelector)) {
         touchStartYRef.current = null;
         return;
      }

      const startY = touchStartYRef.current;
      touchStartYRef.current = null;

      if (startY === null) {
         return;
      }

      const endY = event.changedTouches[0]?.clientY ?? startY;
      if (endY - startY > 48) {
         onClose();
      }
   };

   const handleSurfaceKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
      surfaceProps?.onKeyDown?.(event);
      if (event.defaultPrevented || event.key !== "Tab") {
         return;
      }

      trapTabFocus(event, event.currentTarget);
   };

   return (
      <div
         {...rootProps}
         className={rootClassName}
         role="presentation"
         data-closing={isClosing ? "true" : undefined}
         onTouchStart={handleTouchStart}
         onTouchEnd={handleTouchEnd}
      >
         <button className={backdropClassNames} type="button" aria-label={closeLabel} onClick={onClose} />
         <section
            {...surfaceProps}
            className={surfaceClassNames}
            role="dialog"
            aria-modal="true"
            aria-labelledby={labelledBy}
            aria-label={label}
            ref={surfaceRef}
            tabIndex={-1}
            onClick={(event) => {
               event.stopPropagation();
               surfaceProps?.onClick?.(event);
            }}
            onKeyDown={handleSurfaceKeyDown}
         >
            {children}
         </section>
      </div>
   );
}

function useOverlayLifecycle(overlayId: string, surfaceRef: RefObject<HTMLElement | null>, closeOnEscape: boolean, onClose: () => void) {
   useEffect(() => {
      const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      overlayStack.push(overlayId);
      const focusFrame = window.requestAnimationFrame(() => {
         const surface = surfaceRef.current;
         const firstFocusable = surface?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
         (firstFocusable ?? surface)?.focus();
      });

      const handleKeyDown = (event: KeyboardEvent) => {
         const isTopmost = overlayStack.at(-1) === overlayId;
         if (!isTopmost || !closeOnEscape || event.key !== "Escape" || event.defaultPrevented || event.isComposing) {
            return;
         }

         event.preventDefault();
         event.stopImmediatePropagation();
         onClose();
      };

      document.addEventListener("keydown", handleKeyDown);
      return () => {
         window.cancelAnimationFrame(focusFrame);
         document.removeEventListener("keydown", handleKeyDown);
         const stackIndex = overlayStack.lastIndexOf(overlayId);
         if (stackIndex >= 0) {
            overlayStack.splice(stackIndex, 1);
         }
         if (previouslyFocused?.isConnected) {
            window.requestAnimationFrame(() => previouslyFocused.focus());
         }
      };
   }, [closeOnEscape, onClose, overlayId, surfaceRef]);
}

function useLockedBodyScroll() {
   useEffect(() => {
      if (bodyLockCount === 0) {
         originalBodyOverflow = document.body.style.overflow;
         originalBodyOverscrollBehavior = document.body.style.overscrollBehavior;
         document.body.style.overflow = "hidden";
         document.body.style.overscrollBehavior = "contain";
      }
      bodyLockCount += 1;

      return () => {
         bodyLockCount = Math.max(0, bodyLockCount - 1);
         if (bodyLockCount === 0) {
            document.body.style.overflow = originalBodyOverflow;
            document.body.style.overscrollBehavior = originalBodyOverscrollBehavior;
         }
      };
   }, []);
}

function isSwipeIgnored(target: EventTarget, selector: string | undefined) {
   return Boolean(selector && target instanceof Element && target.closest(selector));
}

function trapTabFocus(event: ReactKeyboardEvent<HTMLElement>, surface: HTMLElement) {
   const focusableElements = [...surface.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)].filter(
      (element) => element.getClientRects().length > 0 && element.getAttribute("aria-hidden") !== "true"
   );
   const first = focusableElements[0];
   const last = focusableElements.at(-1);

   if (!first || !last) {
      event.preventDefault();
      surface.focus();
      return;
   }

   if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
   } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
   }
}
