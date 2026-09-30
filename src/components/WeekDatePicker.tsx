import { useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { isoWeekNumber, shiftCalendarDate, weekDistance } from "../../shared/calendar";
import { MAX_WEEK_OFFSET, MIN_WEEK_OFFSET } from "../../shared/weeks";
import { getIsoWeekday, formatWeekTitle } from "../lib/date";
import { usePanelClose } from "../hooks/usePanelClose";
import { IconButton } from "./IconButton";
import { OverlayPanel } from "./OverlayPanel";
import "./WeekDatePicker.css";

interface WeekDatePickerProps {
   anchor: string;
   selectedOffset: number;
   isWeekNavigable: (offset: number) => boolean;
   onSelect: (offset: number) => void;
   onClose: () => void;
}
const monthLabel = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
const shortMonthLabel = new Intl.DateTimeFormat("en-GB", { month: "short", timeZone: "UTC" });
const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const monthOf = (date: string) => date.slice(0, 7) + "-01";
const mondayOf = (date: string) => shiftCalendarDate(date, 1 - getIsoWeekday(date));
function shiftMonth(month: string, amount: number) {
   const value = new Date(`${month}T00:00:00Z`);
   value.setUTCMonth(value.getUTCMonth() + amount);
   return value.toISOString().slice(0, 10);
}

/** A continuous calendar with one selectable row per ISO week. */
export function WeekDatePicker({ anchor, selectedOffset, isWeekNavigable, onSelect, onClose }: WeekDatePickerProps) {
   const selectedMonday = shiftCalendarDate(anchor, selectedOffset * 7);
   const [month, setMonth] = useState(() => monthOf(selectedMonday));
   const [choosingMonth, setChoosingMonth] = useState(false);
   const scrollRef = useRef<HTMLDivElement>(null);
   const scrollDestination = useRef<number | null>(null);
   const calendarMonth = useRef(month);
   const focusPendingMonth = useRef(false);
   const pendingSelection = useRef<number | null>(null);
   const pendingMonth = useRef<string | null>(monthOf(selectedMonday));
   const { isClosing, close } = usePanelClose(true, () => {
      if (pendingSelection.current !== null) onSelect(pendingSelection.current);
      else onClose();
   });
   const minMonth = monthOf(shiftCalendarDate(anchor, MIN_WEEK_OFFSET * 7));
   const maxMonth = monthOf(shiftCalendarDate(anchor, MAX_WEEK_OFFSET * 7 + 6));
   const firstMonday = mondayOf(minMonth);
   const lastMonday = mondayOf(maxMonth);
   const rowCount = Math.max(weekDistance(firstMonday, lastMonday) + 5, weekDistance(firstMonday, anchor) + MAX_WEEK_OFFSET + 1);
   const year = month.slice(0, 4);
   const previous = shiftMonth(month, choosingMonth ? -12 : -1);
   const next = shiftMonth(month, choosingMonth ? 12 : 1);
   const canPrevious = choosingMonth ? year > minMonth.slice(0, 4) : previous >= minMonth;
   const canNext = choosingMonth ? year < maxMonth.slice(0, 4) : next <= maxMonth;
   const scrollToWeek = (monday: string, smooth = true) => {
      const row = scrollRef.current?.querySelector<HTMLButtonElement>(`[data-monday="${monday}"]`);
      if (row && scrollRef.current) {
         scrollDestination.current = row.offsetTop;
         scrollRef.current.scrollTo({ top: row.offsetTop, behavior: smooth && !matchMedia("(prefers-reduced-motion: reduce)").matches ? "smooth" : "instant" });
      }
   };
   const changeMonth = (value: string) => {
      const clamped = value < minMonth ? minMonth : value > maxMonth ? maxMonth : value;
      setMonth(clamped);
      if (!choosingMonth) scrollToWeek(mondayOf(clamped));
   };
   useLayoutEffect(() => {
      if (choosingMonth || !pendingMonth.current) return;
      const target = mondayOf(pendingMonth.current);
      const row = scrollRef.current?.querySelector<HTMLButtonElement>(`[data-monday="${target}"]`);
      if (row && scrollRef.current) {
         scrollDestination.current = row.offsetTop;
         scrollRef.current.scrollTop = row.offsetTop;
      }
      if (focusPendingMonth.current) {
         (row?.disabled ? scrollRef.current?.querySelector<HTMLButtonElement>(".week-date-picker__week:not(:disabled)") : row)?.focus({ preventScroll: true });
      }
      focusPendingMonth.current = false;
      pendingMonth.current = null;
   }, [selectedMonday, choosingMonth]);
   const handleCalendarKey = (event: KeyboardEvent<HTMLDivElement>) => {
      const weeks = [...event.currentTarget.querySelectorAll<HTMLButtonElement>(".week-date-picker__week:not(:disabled)")];
      const index = weeks.indexOf(event.target as HTMLButtonElement);
      if (index < 0) return;
      if (event.key === "PageUp" || event.key === "PageDown") {
         event.preventDefault();
         if (event.key === "PageUp" ? canPrevious : canNext) {
            const value = event.key === "PageUp" ? previous : next;
            changeMonth(value);
            const target = weeks.find((row) => (row.dataset["monday"] ?? "") >= mondayOf(value));
            target?.focus({ preventScroll: true });
         }
      } else if (["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) {
         event.preventDefault();
         scrollDestination.current = null;
         const target = event.key === "Home" ? 0 : event.key === "End" ? weeks.length - 1 : index + (event.key === "ArrowUp" ? -1 : 1);
         weeks[Math.max(0, Math.min(weeks.length - 1, target))]?.focus();
      }
   };
   return (
      <OverlayPanel
         className="week-date-picker"
         surfaceClassName="week-date-picker__panel"
         backdropClassName="week-date-picker__backdrop"
         closeLabel="Close week chooser"
         label="Choose week"
         onClose={close}
         isClosing={isClosing}
         initialFocusSelector='.week-date-picker__week[aria-pressed="true"]:not(:disabled)'
      >
         <div className="week-date-picker__header">
            <IconButton
               icon="fa-solid fa-arrow-up"
               label={choosingMonth ? "Previous year" : "Previous month"}
               disabled={!canPrevious}
               onClick={() => changeMonth(previous)}
            />
            <button
               className="week-date-picker__month"
               type="button"
               aria-label={choosingMonth ? "Back to weeks" : "Choose month"}
               aria-expanded={choosingMonth}
               onClick={() => {
                  if (choosingMonth) setMonth(calendarMonth.current);
                  else calendarMonth.current = month;
                  setChoosingMonth(!choosingMonth);
               }}
            >
               <span aria-live="polite">{choosingMonth ? year : monthLabel.format(new Date(`${month}T00:00:00Z`))}</span>
               <i className={choosingMonth ? "fa-solid fa-chevron-up" : "fa-solid fa-chevron-down"} aria-hidden="true" />
            </button>
            <IconButton
               icon="fa-solid fa-arrow-down"
               label={choosingMonth ? "Next year" : "Next month"}
               disabled={!canNext}
               onClick={() => changeMonth(next)}
            />
         </div>
         <div className="week-date-picker__body">
            <div className="week-date-picker__months" hidden={!choosingMonth}>
               {Array.from({ length: 12 }, (_, index) => {
                  const value = `${year}-${String(index + 1).padStart(2, "0")}-01`;
                  return (
                     <button
                        type="button"
                        key={value}
                        disabled={value < minMonth || value > maxMonth}
                        aria-pressed={value === month}
                        onClick={() => {
                           focusPendingMonth.current = true;
                           pendingMonth.current = value;
                           setMonth(value);
                           setChoosingMonth(false);
                        }}
                     >
                        {shortMonthLabel.format(new Date(`${value}T00:00:00Z`))}
                     </button>
                  );
               })}
            </div>
            <div className="week-date-picker__calendar" hidden={choosingMonth} onKeyDown={handleCalendarKey}>
               <div className="week-date-picker__weekdays" aria-hidden="true">
                  <span />
                  {weekdays.map((day) => (
                     <span key={day}>{day}</span>
                  ))}
               </div>
               <div
                  className="week-date-picker__scroll"
                  ref={scrollRef}
                  onWheel={() => {
                     scrollDestination.current = null;
                  }}
                  onTouchStart={() => {
                     scrollDestination.current = null;
                  }}
                  onScrollEnd={(event) => {
                     if (scrollDestination.current !== null && Math.abs(event.currentTarget.scrollTop - scrollDestination.current) > 1) return;
                     scrollDestination.current = null;
                     if (!event.currentTarget.clientHeight) return;
                     const row = Math.round(event.currentTarget.scrollTop / (event.currentTarget.clientHeight / 5));
                     const visibleMonth = monthOf(shiftCalendarDate(firstMonday, row * 7 + 6));
                     setMonth(visibleMonth < minMonth ? minMonth : visibleMonth > maxMonth ? maxMonth : visibleMonth);
                  }}
               >
                  {Array.from({ length: rowCount }, (_, index) => {
                     const monday = shiftCalendarDate(firstMonday, index * 7);
                     const offset = weekDistance(anchor, monday);
                     const number = isoWeekNumber(monday);
                     return (
                        <button
                           type="button"
                           className="week-date-picker__week"
                           key={monday}
                           data-monday={monday}
                           disabled={!isWeekNavigable(offset)}
                           aria-label={formatWeekTitle(monday, shiftCalendarDate(monday, 6), number)}
                           aria-pressed={monday === selectedMonday}
                           onClick={() => {
                              if (isClosing) return;
                              pendingSelection.current = offset;
                              close();
                           }}
                        >
                           <span className="week-date-picker__number" aria-hidden="true">
                              {number}
                           </span>
                           {weekdays.map((_, dayIndex) => {
                              const date = shiftCalendarDate(monday, dayIndex);
                              return (
                                 <span key={date} data-outside={monthOf(date) !== month} aria-hidden="true">
                                    {Number(date.slice(8))}
                                 </span>
                              );
                           })}
                        </button>
                     );
                  })}
               </div>
            </div>
         </div>
      </OverlayPanel>
   );
}
