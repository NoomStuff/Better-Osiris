import { useId, type CSSProperties, type FocusEvent, type MouseEvent } from "react";
import { useDelayedTooltip } from "../hooks/useDelayedTooltip";
import { useShortcutActivation } from "../hooks/useShortcutActivation";
import { TooltipContent, type TooltipAlign, type TooltipPlacement } from "./Tooltip";
import "./ToolbarActionGroup.css";

export interface ToolbarActionOption<T extends string> {
   id: T;
   label: string;
   tooltip: string;
   shortcut?: string;
   disabled?: boolean;
   activationId?: string;
}

export interface ToolbarCommandAction {
   id: string;
   label: string;
   tooltip: string;
   shortcut?: string;
   disabled?: boolean;
   activationId?: string;
   onPress: () => void;
}

interface ToolbarActionSelectorProps<T extends string> {
   label: string;
   options: readonly ToolbarActionOption<T>[];
   value: T;
   onChange: (value: T) => void;
}

interface ToolbarActionButtonsProps {
   label: string;
   actions: readonly ToolbarCommandAction[];
}

interface ToolbarActionItemProps {
   label: string;
   tooltip: string;
   shortcut?: string | undefined;
   selected?: boolean;
   disabled?: boolean | undefined;
   activationId?: string | undefined;
   role?: "button" | "radio";
   tooltipAlign: TooltipAlign;
   tooltipPlacement?: TooltipPlacement;
   onPress: () => void;
}

type SelectorStyle = CSSProperties & {
   "--toolbar-action-count": number;
   "--toolbar-action-index": number;
};

export function ToolbarActionSelector<T extends string>({ label, options, value, onChange }: ToolbarActionSelectorProps<T>) {
   const selectedIndex = Math.max(
      0,
      options.findIndex((option) => option.id === value)
   );
   const style: SelectorStyle = {
      "--toolbar-action-count": options.length,
      "--toolbar-action-index": selectedIndex,
   };

   return (
      <div className="toolbar-action-group toolbar-action-group--selector" role="radiogroup" aria-label={label} style={style}>
         {options.map((option, index) => (
            <ToolbarActionItem
               key={option.id}
               label={option.label}
               tooltip={option.tooltip}
               shortcut={option.shortcut}
               activationId={option.activationId}
               selected={option.id === value}
               disabled={option.disabled}
               role="radio"
               tooltipAlign={getTooltipAlign(index, options.length)}
               tooltipPlacement="bottom"
               onPress={() => onChange(option.id)}
            />
         ))}
      </div>
   );
}

export function ToolbarActionButtons({ label, actions }: ToolbarActionButtonsProps) {
   return (
      <div className="toolbar-action-group toolbar-action-group--buttons" role="group" aria-label={label}>
         {actions.map((action, index) => (
            <ToolbarActionItem
               key={action.id}
               label={action.label}
               tooltip={action.tooltip}
               shortcut={action.shortcut}
               activationId={action.activationId}
               disabled={action.disabled}
               tooltipAlign={getTooltipAlign(index, actions.length)}
               tooltipPlacement="bottom"
               onPress={action.onPress}
            />
         ))}
      </div>
   );
}

function ToolbarActionItem({
   label,
   tooltip,
   shortcut,
   selected = false,
   disabled = false,
   activationId,
   role = "button",
   tooltipAlign,
   tooltipPlacement = "top",
   onPress,
}: ToolbarActionItemProps) {
   const tooltipId = useId();
   const { hideTooltip, isTooltipEnabled, isTooltipOpen, showTooltip } = useDelayedTooltip({ disabled });
   const isShortcutActive = useShortcutActivation(activationId);

   const handleMouseEnter = (_event: MouseEvent<HTMLButtonElement>) => {
      showTooltip();
   };

   const handleMouseLeave = (_event: MouseEvent<HTMLButtonElement>) => {
      hideTooltip();
   };

   const handleFocus = (_event: FocusEvent<HTMLButtonElement>) => {
      showTooltip();
   };

   const handleBlur = (_event: FocusEvent<HTMLButtonElement>) => {
      hideTooltip();
   };

   return (
      <button
         className="toolbar-action-group__item"
         type="button"
         role={role}
         aria-checked={role === "radio" ? selected : undefined}
         aria-describedby={isTooltipEnabled ? tooltipId : undefined}
         disabled={disabled}
         data-selected={selected ? "true" : undefined}
         data-shortcut-active={isShortcutActive ? "true" : undefined}
         data-tooltip-align={tooltipAlign}
         data-tooltip-host="true"
         data-tooltip-open={isTooltipOpen ? "true" : undefined}
         data-tooltip-placement={tooltipPlacement}
         onBlur={handleBlur}
         onClick={onPress}
         onFocus={handleFocus}
         onMouseEnter={handleMouseEnter}
         onMouseLeave={handleMouseLeave}
      >
         {label}
         {isTooltipEnabled ? <TooltipContent id={tooltipId} label={tooltip} shortcut={shortcut} /> : null}
      </button>
   );
}

function getTooltipAlign(index: number, count: number): TooltipAlign {
   if (index === 0) {
      return "start";
   }

   if (index === count - 1) {
      return "end";
   }

   return "center";
}
