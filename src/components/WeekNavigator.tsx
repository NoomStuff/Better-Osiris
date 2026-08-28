import { memo, useId, type FocusEvent, type MouseEvent } from "react";
import { useDelayedTooltip } from "../hooks/useDelayedTooltip";
import { useShortcutActivation } from "../hooks/useShortcutActivation";
import { APP_SHORTCUT_LABELS } from "../lib/appShortcuts";
import { getTooltipAnchorName } from "../lib/tooltipAnchor";
import { TooltipContent } from "./Tooltip";
import { IconButton } from "./IconButton";
import "./WeekNavigator.css";

interface WeekNavigatorProps {
   title: string;
   weekOffset: number;
   onPreviousWeek: () => void;
   onNextWeek: () => void;
   onCurrentWeek: () => void;
   canGoPrevious: boolean;
   canGoNext: boolean;
}

function formatWeekLabel(weekOffset: number) {
   if (weekOffset === 0) {
      return "This week";
   }

   if (weekOffset === 1) {
      return "Next week";
   }

   if (weekOffset === -1) {
      return "Last week";
   }

   const absoluteWeeks = Math.abs(weekOffset);
   const suffix = absoluteWeeks === 1 ? "week" : "weeks";

   if (weekOffset > 0) {
      return `In ${absoluteWeeks} ${suffix}`;
   }

   return `${absoluteWeeks} ${suffix} ago`;
}

export const WeekNavigator = memo(function WeekNavigator({
   title,
   weekOffset,
   onPreviousWeek,
   onNextWeek,
   onCurrentWeek,
   canGoPrevious,
   canGoNext,
}: WeekNavigatorProps) {
   const label = formatWeekLabel(weekOffset);
   const isCurrentWeek = weekOffset === 0;
   const weekPosition = weekOffset < 0 ? "past" : weekOffset > 0 ? "future" : "current";
   const tooltipId = useId();
   const anchorName = getTooltipAnchorName(tooltipId);
   const { hideTooltip, isTooltipEnabled, isTooltipOpen, showTooltip } = useDelayedTooltip();
   const isShortcutActive = useShortcutActivation("current-week");
   const weekTooltip = isCurrentWeek ? "Reset the current week view" : "Jump back to the current week";

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
      <section className="weekbar">
         <IconButton
            icon="fa-solid fa-arrow-left"
            label="Previous week"
            shortcut={APP_SHORTCUT_LABELS.previousWeek}
            activationId="previous-week"
            tooltipPlacement="bottom"
            variant="ghost"
            hoverEffect="nudge-left"
            onClick={onPreviousWeek}
            disabled={!canGoPrevious}
         />

         <h2 className="weekbar__heading">
            <button
               className="weekbar__content"
               type="button"
               aria-describedby={isTooltipEnabled ? tooltipId : undefined}
               data-current={isCurrentWeek}
               data-shortcut-active={isShortcutActive ? "true" : undefined}
               data-week-position={weekPosition}
               style={{ anchorName }}
               onBlur={handleBlur}
               onClick={onCurrentWeek}
               onFocus={handleFocus}
               onMouseEnter={handleMouseEnter}
               onMouseLeave={handleMouseLeave}
            >
               <span className="weekbar__label">{label}</span>
               <span className="weekbar__title">{title}</span>
               {isTooltipEnabled ? (
                  <TooltipContent
                     id={tooltipId}
                     anchorName={anchorName}
                     open={isTooltipOpen}
                     placement="bottom"
                     label={weekTooltip}
                     shortcut={APP_SHORTCUT_LABELS.currentWeek}
                  />
               ) : null}
            </button>
         </h2>

         <IconButton
            icon="fa-solid fa-arrow-right"
            label="Next week"
            shortcut={APP_SHORTCUT_LABELS.nextWeek}
            activationId="next-week"
            tooltipPlacement="bottom"
            variant="ghost"
            hoverEffect="nudge-right"
            onClick={onNextWeek}
            disabled={!canGoNext}
         />
      </section>
   );
});
