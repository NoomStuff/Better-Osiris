import { useId, type ButtonHTMLAttributes, type FocusEvent, type MouseEvent, type ReactNode } from "react";
import { useDelayedTooltip } from "../hooks/useDelayedTooltip";
import { useShortcutActivation } from "../hooks/useShortcutActivation";
import { TooltipContent, type TooltipPlacement } from "./Tooltip";
import { getTooltipAnchorName } from "../lib/tooltipAnchor";
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
   activationId,
   className,
   disabled,
   type = "button",
   onMouseEnter,
   onMouseLeave,
   onFocus,
   onBlur,
   onClick,
   style,
   children,
   ...buttonProps
}: IconButtonProps) {
   const tooltipId = useId();
   const tooltipText = tooltip ?? label;
   const hasTooltip = Boolean(tooltipText);
   const { hideTooltip, isTooltipEnabled, isTooltipOpen, showTooltip, showTooltipForFocus } = useDelayedTooltip({ disabled, enabled: hasTooltip });
   const isShortcutActive = useShortcutActivation(activationId);
   const anchorName = getTooltipAnchorName(tooltipId);

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
      showTooltipForFocus(event.currentTarget);
   };

   const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
      hideTooltip();
      onClick?.(event);
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
         data-tooltip-open={isTooltipOpen ? "true" : undefined}
         data-shortcut-active={isShortcutActive ? "true" : undefined}
         style={{ ...style, anchorName }}
         onMouseEnter={handleMouseEnter}
         onMouseLeave={handleMouseLeave}
         onFocus={handleFocus}
         onBlur={handleBlur}
         onClick={handleClick}
      >
         <span className="icon-button__surface">
            <span className="icon-button__icon" aria-hidden="true">
               <i className={icon} />
            </span>
            {children}
         </span>
         {isTooltipEnabled ? (
            <TooltipContent id={tooltipId} anchorName={anchorName} open={isTooltipOpen} placement={tooltipPlacement} label={tooltipText} shortcut={shortcut} />
         ) : null}
      </button>
   );
}
