import {
   useEffect,
   useId,
   useRef,
   useState,
   type HTMLAttributes,
   type KeyboardEvent as ReactKeyboardEvent,
   type ReactNode,
   type RefObject,
   type TouchEvent,
} from "react";
import { lockPageScroll } from "../lib/pageScrollLock";
import { createPortal } from "react-dom";
import { TooltipPortalProvider } from "./Tooltip";
import "./OverlayPanel.css";

const overlayStack: string[] = [];
const overlayRoots = new Map<string, HTMLElement>();
const FOCUSABLE_SELECTOR = [
   "a[href]",
   "button:not([disabled])",
   "input:not([disabled])",
   "select:not([disabled])",
   "textarea:not([disabled])",
   '[tabindex]:not([tabindex="-1"])',
].join(",");

/** Slightly above the 220ms closing animations in the panel CSS, so the panel is unmounted only after it fully closed. */
export const PANEL_CLOSE_MS = 240;

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
   dialogRole?: "dialog" | "alertdialog";
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
   dialogRole = "dialog",
}: OverlayPanelProps) {
   const overlayId = useId();
   const surfaceRef = useRef<HTMLElement | null>(null);
   const rootRef = useRef<HTMLDivElement | null>(null);
   const [tooltipRoot, setTooltipRoot] = useState<HTMLDivElement | null>(null);
   const returnFocusRef = useRef<HTMLElement | null>(document.activeElement instanceof HTMLElement ? document.activeElement : null);
   const touchStartYRef = useRef<number | null>(null);
   useOverlayLifecycle(overlayId, rootRef, surfaceRef, returnFocusRef, closeOnEscape, onClose);
   useEffect(lockPageScroll, []);

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
      <TooltipPortalProvider target={tooltipRoot}>
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
               role={dialogRole}
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
            <div className="overlay-panel__tooltips" ref={setTooltipRoot} />
         </div>
      </TooltipPortalProvider>,
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
   const onCloseRef = useRef(onClose);

   useEffect(() => {
      onCloseRef.current = onClose;
   }, [onClose]);

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
         (firstFocusable ?? surface)?.focus({ preventScroll: true });
      });

      const handleKeyDown = (event: KeyboardEvent) => {
         const isTopmost = overlayStack.at(-1) === overlayId;
         if (!isTopmost || !closeOnEscape || event.key !== "Escape" || event.defaultPrevented || event.isComposing) {
            return;
         }

         event.preventDefault();
         event.stopImmediatePropagation();
         onCloseRef.current();
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
   }, [closeOnEscape, overlayId, returnFocusRef, rootRef, surfaceRef]);
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
