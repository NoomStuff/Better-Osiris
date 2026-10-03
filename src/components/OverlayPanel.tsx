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
import {
   abandonOverlayHistoryEntry,
   beginOverlayHistoryEntry,
   endOverlayHistoryEntry,
   getTopmostOverlayId,
   pushOverlayId,
   removeOverlayId,
   shouldOverlayCloseOnPopState,
} from "../lib/overlayHistory";
import { createPortal } from "react-dom";
import { TooltipPortalProvider } from "./Tooltip";
import "./OverlayPanel.css";

const overlayRoots = new Map<string, HTMLElement>();
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
   initialFocusSelector?: string;
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
   initialFocusSelector,
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
   useOverlayLifecycle(overlayId, rootRef, surfaceRef, returnFocusRef, closeOnEscape, onClose, initialFocusSelector);
   useOverlayHistoryEntry(overlayId, onClose);
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
   onClose: () => void,
   initialFocusSelector?: string
) {
   const onCloseRef = useRef(onClose);

   useEffect(() => {
      onCloseRef.current = onClose;
   }, [onClose]);

   useEffect(() => {
      const previouslyFocused = returnFocusRef.current;
      pushOverlayId(overlayId);
      const root = rootRef.current;
      if (root) {
         overlayRoots.set(overlayId, root);
      }
      syncOverlayInertness();
      const focusFrame = window.requestAnimationFrame(() => {
         const surface = surfaceRef.current;
         const firstFocusable =
            (initialFocusSelector ? surface?.querySelector<HTMLElement>(initialFocusSelector) : null) ??
            surface?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
         (firstFocusable ?? surface)?.focus({ preventScroll: true });
      });

      const handleKeyDown = (event: KeyboardEvent) => {
         const isTopmost = getTopmostOverlayId() === overlayId;
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
         removeOverlayId(overlayId);
         overlayRoots.delete(overlayId);
         syncOverlayInertness();
         if (previouslyFocused?.isConnected) {
            previouslyFocused.focus({ preventScroll: true });
            if (document.activeElement !== previouslyFocused) {
               window.requestAnimationFrame(() => previouslyFocused.focus({ preventScroll: true }));
            }
         }
      };
   }, [closeOnEscape, initialFocusSelector, overlayId, returnFocusRef, rootRef, surfaceRef]);
}

function useOverlayHistoryEntry(overlayId: string, onClose: () => void) {
   const onCloseRef = useRef(onClose);

   useEffect(() => {
      onCloseRef.current = onClose;
   }, [onClose]);

   useEffect(() => {
      beginOverlayHistoryEntry(overlayId);

      const handlePopState = (event: PopStateEvent) => {
         if (!shouldOverlayCloseOnPopState(overlayId, event)) {
            return;
         }

         abandonOverlayHistoryEntry(overlayId);
         onCloseRef.current();
      };
      window.addEventListener("popstate", handlePopState);

      return () => {
         window.removeEventListener("popstate", handlePopState);
         endOverlayHistoryEntry(overlayId);
      };
   }, [overlayId]);
}

function syncOverlayInertness() {
   const topmostId = getTopmostOverlayId();
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
