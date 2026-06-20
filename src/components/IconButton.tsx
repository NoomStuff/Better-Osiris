import { useId, type ButtonHTMLAttributes, type FocusEvent, type MouseEvent, type ReactNode } from "react";
import { useDelayedTooltip } from "../hooks/useDelayedTooltip";
import { useShortcutActivation } from "../hooks/useShortcutActivation";
import { TooltipContent, type TooltipAlign, type TooltipPlacement } from "./Tooltip";
import "./IconButton.css";

type IconButtonHoverEffect = "nudge-left" | "nudge-right" | "rotate";

interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
   icon: string;
   label: string;
   tooltip?: string;
   shortcut?: string;
   selected?: boolean;
   variant?: "default" | "ghost";
   hoverEffect?: IconButtonHoverEffect;
   tooltipPlacement?: TooltipPlacement;
   tooltipAlign?: TooltipAlign;
   activationId?: string;
   children?: ReactNode;
}

export function IconButton({
   icon,
   label,
   tooltip,
   shortcut,
   selected = false,
   variant = "default",
   hoverEffect,
   tooltipPlacement = "top",
   tooltipAlign = "center",
   activationId,
   className,
   disabled,
   type = "button",
   onMouseEnter,
   onMouseLeave,
   onFocus,
   onBlur,
   children,
   ...buttonProps
}: IconButtonProps) {
   const tooltipId = useId();
   const tooltipText = tooltip ?? label;
   const hasTooltip = Boolean(tooltipText);
   const { hideTooltip, isTooltipEnabled, isTooltipOpen, showTooltip } = useDelayedTooltip({ disabled, enabled: hasTooltip });
   const isShortcutActive = useShortcutActivation(activationId);

   const handleMouseEnter = (event: MouseEvent<HTMLButtonElement>) => {
      onMouseEnter?.(event);
      showTooltip();
   };

   const handleMouseLeave = (event: MouseEvent<HTMLButtonElement>) => {
      onMouseLeave?.(event);
      hideTooltip();
   };

   const handleFocus = (event: FocusEvent<HTMLButtonElement>) => {
      onFocus?.(event);
      showTooltip();
   };

   const handleBlur = (event: FocusEvent<HTMLButtonElement>) => {
      onBlur?.(event);
      hideTooltip();
   };

   const classes = ["icon-button", `icon-button--${variant}`, selected ? "is-selected" : "", className ?? ""].filter(Boolean).join(" ");

   return (
      <button
         {...buttonProps}
         className={classes}
         type={type}
         aria-label={label}
         aria-describedby={isTooltipEnabled ? tooltipId : undefined}
         disabled={disabled}
         data-hover-effect={hoverEffect}
         data-shortcut-active={isShortcutActive ? "true" : undefined}
         data-tooltip-align={tooltipAlign}
         data-tooltip-host="true"
         data-tooltip-open={isTooltipOpen ? "true" : undefined}
         data-tooltip-placement={tooltipPlacement}
         onMouseEnter={handleMouseEnter}
         onMouseLeave={handleMouseLeave}
         onFocus={handleFocus}
         onBlur={handleBlur}
      >
         <span className="icon-button__surface">
            <span className="icon-button__icon" aria-hidden="true">
               <i className={icon} />
            </span>
            {children}
         </span>
         {isTooltipEnabled ? <TooltipContent id={tooltipId} label={tooltipText} shortcut={shortcut} /> : null}
      </button>
   );
}
