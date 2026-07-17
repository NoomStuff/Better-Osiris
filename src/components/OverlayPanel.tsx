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
import { createPortal } from "react-dom";
import "./OverlayPanel.css";

const overlayStack: string[] = [];
const overlayRoots = new Map<string, HTMLElement>();
let bodyLockCount = 0;
let originalBodyOverflow = "";
let originalBodyOverscrollBehavior = "";
let originalHtmlOverflow = "";
let originalHtmlOverflowPriority = "";
let originalHtmlOverscrollBehavior = "";
let originalHtmlOverscrollPriority = "";
let originalBodyPosition = "";
let originalBodyTop = "";
let originalBodyWidth = "";
let originalScrollY = 0;

const FOCUSABLE_SELECTOR = [
   "a[href]",
   "button:not([disabled])",
   "input:not([disabled])",
   "select:not([disabled])",
   "textarea:not([disabled])",
   '[tabindex]:not([tabindex="-1"])',
].join(",");

interface OverlayPanelBaseProps {
   children: ReactNode;
   className?: string;
   surfaceClassName?: string;
   backdropClassName?: string;
   closeLabel: string;
   placement?: "center" | "bottom";
   isClosing?: boolean;
   closeOnEscape?: boolean;
   closeOnSwipeDown?: boolean;
   swipeIgnoreSelector?: string;
   onClose: () => void;
   rootProps?: HTMLAttributes<HTMLDivElement>;
   surfaceProps?: HTMLAttributes<HTMLElement>;
}

type OverlayPanelProps = OverlayPanelBaseProps & ({ labelledBy: string; label?: never } | { label: string; labelledBy?: never });

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
   const rootRef = useRef<HTMLDivElement | null>(null);
   const returnFocusRef = useRef<HTMLElement | null>(document.activeElement instanceof HTMLElement ? document.activeElement : null);
   const touchStartYRef = useRef<number | null>(null);
   useOverlayLifecycle(overlayId, rootRef, surfaceRef, returnFocusRef, closeOnEscape, onClose);
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

   return createPortal(
      <div
         {...rootProps}
         className={rootClassName}
         data-overlay-id={overlayId}
         ref={rootRef}
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
      </div>,
      document.body
   );
}

function useOverlayLifecycle(
   overlayId: string,
   rootRef: RefObject<HTMLDivElement | null>,
   surfaceRef: RefObject<HTMLElement | null>,
   returnFocusRef: RefObject<HTMLElement | null>,
   closeOnEscape: boolean,
   onClose: () => void
) {
   useEffect(() => {
      const previouslyFocused = returnFocusRef.current;
      overlayStack.push(overlayId);
      const root = rootRef.current;
      if (root) {
         overlayRoots.set(overlayId, root);
      }
      syncOverlayInertness();
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
         overlayRoots.delete(overlayId);
         syncOverlayInertness();
         if (previouslyFocused?.isConnected) {
            previouslyFocused.focus({ preventScroll: true });
            if (document.activeElement !== previouslyFocused) {
               window.requestAnimationFrame(() => previouslyFocused.focus({ preventScroll: true }));
            }
         }
      };
   }, [closeOnEscape, onClose, overlayId, returnFocusRef, rootRef, surfaceRef]);
}

function useLockedBodyScroll() {
   useEffect(() => {
      if (bodyLockCount === 0) {
         const htmlStyle = document.documentElement.style;
         originalBodyOverflow = document.body.style.overflow;
         originalBodyOverscrollBehavior = document.body.style.overscrollBehavior;
         originalHtmlOverflow = htmlStyle.getPropertyValue("overflow");
         originalHtmlOverflowPriority = htmlStyle.getPropertyPriority("overflow");
         originalHtmlOverscrollBehavior = htmlStyle.getPropertyValue("overscroll-behavior");
         originalHtmlOverscrollPriority = htmlStyle.getPropertyPriority("overscroll-behavior");
         originalBodyPosition = document.body.style.position;
         originalBodyTop = document.body.style.top;
         originalBodyWidth = document.body.style.width;
         originalScrollY = window.scrollY;
         htmlStyle.setProperty("overflow", "hidden", "important");
         htmlStyle.setProperty("overscroll-behavior", "none", "important");
         document.body.style.overflow = "hidden";
         document.body.style.overscrollBehavior = "none";
         document.body.style.position = "fixed";
         document.body.style.top = `${-originalScrollY}px`;
         document.body.style.width = "100%";
      }
      bodyLockCount += 1;

      return () => {
         bodyLockCount = Math.max(0, bodyLockCount - 1);
         if (bodyLockCount === 0) {
            document.body.style.overflow = originalBodyOverflow;
            document.body.style.overscrollBehavior = originalBodyOverscrollBehavior;
            document.body.style.position = originalBodyPosition;
            document.body.style.top = originalBodyTop;
            document.body.style.width = originalBodyWidth;
            restoreStyleProperty(document.documentElement.style, "overflow", originalHtmlOverflow, originalHtmlOverflowPriority);
            restoreStyleProperty(document.documentElement.style, "overscroll-behavior", originalHtmlOverscrollBehavior, originalHtmlOverscrollPriority);
            window.scrollTo(0, originalScrollY);
         }
      };
   }, []);
}

function syncOverlayInertness() {
   const topmostId = overlayStack.at(-1);
   const appRoot = document.getElementById("app");
   if (appRoot) {
      appRoot.inert = Boolean(topmostId);
      appRoot.setAttribute("aria-hidden", topmostId ? "true" : "false");
   }

   overlayRoots.forEach((root, id) => {
      const isBackgroundOverlay = id !== topmostId;
      root.inert = isBackgroundOverlay;
      root.setAttribute("aria-hidden", isBackgroundOverlay ? "true" : "false");
   });
}

function restoreStyleProperty(style: CSSStyleDeclaration, property: string, value: string, priority: string) {
   if (value) {
      style.setProperty(property, value, priority);
   } else {
      style.removeProperty(property);
   }
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
