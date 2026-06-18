import type { ReactNode } from "react";
import "./Tooltip.css";

export type TooltipPlacement = "top" | "bottom";
export type TooltipAlign = "start" | "center" | "end";

interface TooltipContentProps {
   id: string;
   label: ReactNode;
   shortcut?: ReactNode;
}

export function TooltipContent({ id, label, shortcut }: TooltipContentProps) {
   return (
      <span className="control-tooltip" id={id} role="tooltip">
         <span className="control-tooltip__label">{label}</span>
         {shortcut ? <span className="control-tooltip__shortcut">{shortcut}</span> : null}
      </span>
   );
}
