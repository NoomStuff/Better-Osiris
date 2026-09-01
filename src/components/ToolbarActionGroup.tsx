import { useId, type CSSProperties, type FocusEvent, type KeyboardEvent, type MouseEvent } from "react";
import { useDelayedTooltip } from "../hooks/useDelayedTooltip";
import { useShortcutActivation } from "../hooks/useShortcutActivation";
import { TooltipContent, type TooltipPlacement } from "./Tooltip";
import { getTooltipAnchorName } from "../lib/tooltipAnchor";
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
   tabIndex?: number;
   optionId?: string;
   tooltipPlacement: TooltipPlacement;
   onPress: () => void;
}

type ToolbarActionCountStyle = CSSProperties & {
   "--toolbar-action-count": number;
};

type SelectorStyle = ToolbarActionCountStyle & {
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

   const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
      if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) {
         return;
      }

      const enabledOptions = options.filter((option) => !option.disabled);
      if (enabledOptions.length === 0) {
         return;
      }

      const currentIndex = Math.max(
         0,
         enabledOptions.findIndex((option) => option.id === value)
      );
      const nextIndex = getNextSelectorIndex(event.key, currentIndex, enabledOptions.length);
      const nextOption = enabledOptions[nextIndex];
      if (!nextOption) {
         return;
      }

      event.preventDefault();
      event.stopPropagation();
      onChange(nextOption.id);
      event.currentTarget.querySelector<HTMLButtonElement>(`[data-option-id="${CSS.escape(nextOption.id)}"]`)?.focus();
   };

   return (
      <div className="toolbar-action-group toolbar-action-group--selector" role="radiogroup" aria-label={label} style={style} onKeyDown={handleKeyDown}>
         {options.map((option) => (
            <ToolbarActionItem
               key={option.id}
               label={option.label}
               tooltip={option.tooltip}
               shortcut={option.shortcut}
               activationId={option.activationId}
               selected={option.id === value}
               disabled={option.disabled}
               role="radio"
               tabIndex={option.id === value ? 0 : -1}
               optionId={option.id}
               tooltipPlacement="bottom"
               onPress={() => onChange(option.id)}
            />
         ))}
      </div>
   );
}

export function ToolbarActionButtons({ label, actions }: ToolbarActionButtonsProps) {
   const style: ToolbarActionCountStyle = { "--toolbar-action-count": actions.length };

   return (
      <div className="toolbar-action-group toolbar-action-group--buttons" role="group" aria-label={label} style={style}>
         {actions.map((action) => (
            <ToolbarActionItem
               key={action.id}
               label={action.label}
               tooltip={action.tooltip}
               shortcut={action.shortcut}
               activationId={action.activationId}
               disabled={action.disabled}
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
   tabIndex,
   optionId,
   tooltipPlacement,
   onPress,
}: ToolbarActionItemProps) {
   const tooltipId = useId();
   const { hideTooltip, isTooltipEnabled, isTooltipOpen, showTooltip, showTooltipForFocus } = useDelayedTooltip({ disabled });
   const isShortcutActive = useShortcutActivation(activationId);
   const anchorName = getTooltipAnchorName(tooltipId);

   const handleMouseEnter = (_event: MouseEvent<HTMLButtonElement>) => {
      showTooltip();
   };

   const handleMouseLeave = (_event: MouseEvent<HTMLButtonElement>) => {
      hideTooltip();
   };

   const handleFocus = (event: FocusEvent<HTMLButtonElement>) => {
      showTooltipForFocus(event.currentTarget);
   };

   const handlePress = () => {
      hideTooltip();
      onPress();
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
         data-option-id={optionId}
         disabled={disabled}
         tabIndex={tabIndex}
         data-selected={selected ? "true" : undefined}
         data-tooltip-open={isTooltipOpen ? "true" : undefined}
         data-shortcut-active={isShortcutActive ? "true" : undefined}
         style={{ anchorName }}
         onBlur={handleBlur}
         onClick={handlePress}
         onFocus={handleFocus}
         onMouseEnter={handleMouseEnter}
         onMouseLeave={handleMouseLeave}
      >
         {label}
         {isTooltipEnabled ? (
            <TooltipContent id={tooltipId} anchorName={anchorName} open={isTooltipOpen} placement={tooltipPlacement} label={tooltip} shortcut={shortcut} />
         ) : null}
      </button>
   );
}

function getNextSelectorIndex(key: string, currentIndex: number, optionCount: number) {
   if (key === "Home") return 0;
   if (key === "End") return optionCount - 1;
   const direction = key === "ArrowLeft" || key === "ArrowUp" ? -1 : 1;
   return (currentIndex + direction + optionCount) % optionCount;
}
