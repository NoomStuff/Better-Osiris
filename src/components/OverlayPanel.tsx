import { useEffect, useRef, type HTMLAttributes, type ReactNode, type TouchEvent } from "react";
import "./OverlayPanel.css";

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
   useLockedBodyScroll(true);
   useCloseOnEscape(closeOnEscape, onClose);
   const touchStartYRef = useRef<number | null>(null);

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
            onClick={(event) => {
               event.stopPropagation();
               surfaceProps?.onClick?.(event);
            }}
         >
            {children}
         </section>
      </div>
   );
}

function useCloseOnEscape(enabled: boolean, onClose: () => void) {
   useEffect(() => {
      if (!enabled) {
         return undefined;
      }

      const handleKeyDown = (event: KeyboardEvent) => {
         if (event.key !== "Escape" || event.defaultPrevented || event.isComposing) {
            return;
         }

         event.preventDefault();
         onClose();
      };

      document.addEventListener("keydown", handleKeyDown);
      return () => document.removeEventListener("keydown", handleKeyDown);
   }, [enabled, onClose]);
}

function useLockedBodyScroll(enabled: boolean) {
   useEffect(() => {
      if (!enabled) {
         return undefined;
      }

      const previousOverflow = document.body.style.overflow;
      const previousOverscrollBehavior = document.body.style.overscrollBehavior;
      document.body.style.overflow = "hidden";
      document.body.style.overscrollBehavior = "contain";

      return () => {
         document.body.style.overflow = previousOverflow;
         document.body.style.overscrollBehavior = previousOverscrollBehavior;
      };
   }, [enabled]);
}

function isSwipeIgnored(target: EventTarget, selector: string | undefined) {
   return Boolean(selector && target instanceof Element && target.closest(selector));
}
