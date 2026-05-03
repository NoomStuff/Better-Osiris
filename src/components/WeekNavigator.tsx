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

export function WeekNavigator({ title, weekOffset, onPreviousWeek, onNextWeek, onCurrentWeek, canGoPrevious, canGoNext }: WeekNavigatorProps) {
   const label = formatWeekLabel(weekOffset);
   const isCurrentWeek = weekOffset === 0;

   return (
      <section className="weekbar">
         <button className="icon-button icon-button--ghost" type="button" onClick={onPreviousWeek} aria-label="Previous week" disabled={!canGoPrevious}>
            <i className="fa-solid fa-arrow-left" />
         </button>

         <button className="weekbar__content" type="button" onClick={onCurrentWeek} data-current={isCurrentWeek}>
            <p className="weekbar__label">{label}</p>
            <h2>{title}</h2>
         </button>

         <button className="icon-button icon-button--ghost" type="button" onClick={onNextWeek} aria-label="Next week" disabled={!canGoNext}>
            <i className="fa-solid fa-arrow-right" />
         </button>
      </section>
   );
}
