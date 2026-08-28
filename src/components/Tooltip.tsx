import type { ReactNode } from "react";
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

export function TooltipContent({ id, anchorName, open, placement, label, shortcut }: TooltipContentProps) {
   // Portaled to the body and position: fixed so the browser anchors and flips against the
   // viewport; an in-place tooltip would be re-contained by ancestors with transforms or
   // backdrop filters (the mobile bottom bar).
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
      document.body
   );
}
