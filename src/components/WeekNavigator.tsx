import "./WeekNavigator.css";

interface WeekNavigatorProps {
   title: string;
   onPreviousWeek: () => void;
   onNextWeek: () => void;
   onCurrentWeek: () => void;
   canGoPrevious: boolean;
   canGoNext: boolean;
}

export function WeekNavigator({ title, onPreviousWeek, onNextWeek, onCurrentWeek, canGoPrevious, canGoNext }: WeekNavigatorProps) {
   return (
      <section className="weekbar">
         <button className="icon-button icon-button--ghost" type="button" onClick={onPreviousWeek} aria-label="Previous week" disabled={!canGoPrevious}>
            <i className="fa-solid fa-arrow-left" />
         </button>

         <button className="weekbar__content" type="button" onClick={onCurrentWeek}>
            <p className="weekbar__label">Week</p>
            <h2>{title}</h2>
         </button>

         <button className="icon-button icon-button--ghost" type="button" onClick={onNextWeek} aria-label="Next week" disabled={!canGoNext}>
            <i className="fa-solid fa-arrow-right" />
         </button>
      </section>
   );
}
