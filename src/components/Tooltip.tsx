import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import "./Tooltip.css";

export type TooltipPlacement = "top" | "bottom";

interface TooltipContentProps {
   id: string;
   anchorName: string;
   open: boolean;
   placement: TooltipPlacement;
   label: ReactNode;
   shortcut?: ReactNode;
}

const TooltipPortalContext = createContext<HTMLElement | null | undefined>(undefined);

export function TooltipPortalProvider({ target, children }: { target: HTMLElement | null; children: ReactNode }) {
   return <TooltipPortalContext.Provider value={target}>{children}</TooltipPortalContext.Provider>;
}

export function TooltipContent({ id, anchorName, open, placement, label, shortcut }: TooltipContentProps) {
   const overlayTarget = useContext(TooltipPortalContext);
   const tooltipRef = useRef<HTMLSpanElement | null>(null);
   const [renderedPlacement, setRenderedPlacement] = useState<TooltipPlacement>(placement);

   useEffect(() => {
      setRenderedPlacement(placement);
   }, [placement]);

   // position-try-fallbacks can land the tooltip on the opposite side of the requested
   // placement. The browser picks the side during layout, so read back the applied
   // position-area and keep data-placement on it so the arrow keeps pointing at the anchor.
   useLayoutEffect(() => {
      if (!open) {
         return;
      }
      const tooltip = tooltipRef.current;
      if (!tooltip) {
         return;
      }

      const syncPlacement = () => {
         const area = getComputedStyle(tooltip).getPropertyValue("position-area");
         if (area.includes("top")) {
            setRenderedPlacement("top");
         } else if (area.includes("bottom")) {
            setRenderedPlacement("bottom");
         }
      };

      syncPlacement();
      window.addEventListener("resize", syncPlacement);
      window.addEventListener("scroll", syncPlacement, true);
      return () => {
         window.removeEventListener("resize", syncPlacement);
         window.removeEventListener("scroll", syncPlacement, true);
      };
   }, [open]);

   if (overlayTarget === null) {
      return null;
   }

   // Kept outside transformed and clipped controls so fixed anchor positioning can flip
   // against the viewport. Overlays provide their own layer after the dialog surface so
   // anchor names declared inside a portaled dialog remain in scope.
   return createPortal(
      <span
         className="control-tooltip"
         id={id}
         role="tooltip"
         ref={tooltipRef}
         data-open={open ? "true" : undefined}
         data-placement={renderedPlacement}
         style={{ positionAnchor: anchorName }}
      >
         <span className="control-tooltip__label">{label}</span>
         {shortcut ? <span className="control-tooltip__shortcut">{shortcut}</span> : null}
      </span>,
      overlayTarget ?? document.body
   );
}
