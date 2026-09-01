import { createContext, useContext, type ReactNode } from "react";
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
         data-open={open ? "true" : undefined}
         data-placement={placement}
         style={{ positionAnchor: anchorName }}
      >
         <span className="control-tooltip__label">{label}</span>
         {shortcut ? <span className="control-tooltip__shortcut">{shortcut}</span> : null}
      </span>,
      overlayTarget ?? document.body
   );
}
