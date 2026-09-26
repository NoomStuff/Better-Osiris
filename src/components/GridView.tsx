import { getGridCurrentTime } from "../lib/dayTimeline";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { dayShortLabel, formatClock, fullDayLabel, timeLabel, getMinutesFromMidnight } from "../lib/date";
import { useGridHoverGuide } from "../hooks/useGridHoverGuide";
import { getClassLabel, getClassLocationLabel, getClassWhenLabel } from "../lib/classFormat";
import type { GridHourRange } from "../lib/gridHours";
import type { Day, GridZoom, Class } from "../types/weeks";
import "./GridView.css";
import { ClassStatusMarker } from "./ClassStatusMarker";

interface GridViewProps {
   days: Day[];
   zoom: GridZoom;
   hours: GridHourRange;
   now: Date;
   onSelectClass: (schoolClass: Class) => void;
}

const zoomOptions = [
   { id: "hour", interval: 60 },
   { id: "half", interval: 30 },
   { id: "quarter", interval: 15 },
] as const;

const BASE_INTERVAL = zoomOptions[2].interval;
/** Below this rendered height a schoolClass switches to the compact one-line layout. */
const COMPACT_HEIGHT_PX = 85;
/** Below this rendered height secondary subject text is hidden. */
const TINY_HEIGHT_PX = 64;
type GridStyle = CSSProperties & { "--grid-day-count": number };

export function GridView({ days, zoom: zoomId, hours, now, onSelectClass }: GridViewProps) {
   const [animateZoom, setAnimateZoom] = useState(false);
   const [contentHeight, setContentHeight] = useState(0);
   const previousZoomRef = useRef<GridZoom | null>(null);
   const contentRef = useRef<HTMLDivElement | null>(null);
   const { guideElementRef, guideLabelRef, updateHoverGuide, clearHoverGuide } = useGridHoverGuide(hours);
   const zoom = zoomOptions.find((option) => option.id === zoomId) ?? zoomOptions[0];
   const startMinutes = hours[0] * 60;
   const endMinutes = hours[1] * 60;
   const shownMinutes = endMinutes - startMinutes;
   const timeMarks = useMemo(
      () => Array.from({ length: Math.floor(shownMinutes / BASE_INTERVAL) + 1 }, (_, index) => startMinutes + index * BASE_INTERVAL),
      [shownMinutes, startMinutes]
   );
   const timeLabels = timeMarks.filter((minutes) => minutes !== startMinutes && minutes !== endMinutes);
   const getOffsetPercent = (minutes: number) => ((minutes - startMinutes) / shownMinutes) * 100;
   const { todayKey, visible: showNowLine, top: nowLineTop } = getGridCurrentTime(days, hours, now);

   useEffect(() => {
      if (previousZoomRef.current && previousZoomRef.current !== zoomId) {
         setAnimateZoom(true);
      }
      previousZoomRef.current = zoomId;
   }, [zoomId]);

   useEffect(() => {
      if (!contentRef.current) {
         return;
      }

      const element = contentRef.current;
      const observer = new ResizeObserver((entries) => {
         const entry = entries[0];
         if (entry) {
            setContentHeight(entry.contentRect.height);
         }
      });

      observer.observe(element);
      setContentHeight(element.getBoundingClientRect().height);

      return () => observer.disconnect();
   }, []);

   return (
      <div className="grid-shell" role="region" aria-label="Weekly timetable grid">
         <div className="grid-header" style={{ "--grid-day-count": days.length } as GridStyle}>
            <div className="grid-header__time" />
            {days.map((group) => (
               <div
                  className="grid-header__day"
                  data-today={group.key === todayKey}
                  data-empty={group.classes.length === 0}
                  id={`grid-day-${group.key}`}
                  key={group.key}
               >
                  <span className="grid-header__day-pill">
                     <span>{dayShortLabel.format(group.date)}</span>
                     <strong>{group.key.slice(-2)}</strong>
                  </span>
               </div>
            ))}
         </div>

         <div
            className="grid-body"
            data-animate={animateZoom}
            onAnimationEnd={() => setAnimateZoom(false)}
            onMouseMove={updateHoverGuide}
            onMouseLeave={clearHoverGuide}
         >
            <div className="grid-scroll-content" ref={contentRef}>
               <div className="grid-hover-guide" ref={guideElementRef} aria-hidden="true">
                  <span ref={guideLabelRef} />
               </div>

               <div className="grid-time-column" aria-hidden="true">
                  {timeLabels.map((minutes) => (
                     <div
                        className="grid-time-slot"
                        key={minutes}
                        data-major={minutes % 60 === 0}
                        data-visible={minutes % zoom.interval === 0}
                        style={{ top: `${getOffsetPercent(minutes)}%` }}
                     >
                        {formatClock(minutes)}
                     </div>
                  ))}
               </div>

               <div className="grid-days" style={{ "--grid-day-count": days.length } as GridStyle}>
                  {showNowLine ? (
                     <div
                        aria-hidden="true"
                        className="grid-now-line"
                        style={{
                           top: `${nowLineTop}%`,
                        }}
                     />
                  ) : null}

                  {days.map((group) => (
                     <div className="grid-day-column" key={group.key} role="group" aria-labelledby={`grid-day-${group.key}`}>
                        {timeMarks.map((minutes) => (
                           <div
                              className="grid-line"
                              key={minutes}
                              data-major={minutes % 60 === 0}
                              data-visible={minutes % zoom.interval === 0}
                              style={{ top: `${getOffsetPercent(minutes)}%` }}
                              aria-hidden="true"
                           />
                        ))}

                        {group.classes.map((schoolClass) => {
                           const start = getMinutesFromMidnight(schoolClass.startDate);
                           const end = getMinutesFromMidnight(schoolClass.endDate);
                           const duration = end - start;
                           const top = getOffsetPercent(start);
                           const height = (duration / shownMinutes) * 100;
                           const width = `calc(${100 / schoolClass.overlapCount}% - 5px)`;
                           const left = `calc(${(100 / schoolClass.overlapCount) * schoolClass.overlapIndex}% + 2.5px)`;
                           const visibleHeight = (duration / shownMinutes) * contentHeight;
                           const isCompact = visibleHeight > 0 && visibleHeight < COMPACT_HEIGHT_PX;
                           const timeRange = `${timeLabel.format(schoolClass.startDate)}-${timeLabel.format(schoolClass.endDate)}`;
                           const classLabel = getClassLabel(schoolClass);
                           const extraLabel = schoolClass.subject !== classLabel ? schoolClass.subject : "";
                           const whenLabel = getClassWhenLabel(schoolClass, timeRange);
                           const whereLabel = getClassLocationLabel(schoolClass);
                           const isTiny = visibleHeight > 0 && visibleHeight < TINY_HEIGHT_PX;

                           const accessibleLabel = [
                              classLabel,
                              extraLabel,
                              fullDayLabel.format(schoolClass.startDate),
                              timeRange,
                              schoolClass.teacher,
                              getClassLocationLabel(schoolClass),
                              schoolClass.status === "scheduled" ? "" : schoolClass.status,
                           ]
                              .filter(Boolean)
                              .join(", ");

                           return (
                              <button
                                 className={`grid-class ${isCompact ? "is-tight is-compact" : ""} ${isTiny ? "is-tiny" : ""} status-${schoolClass.status}`}
                                 type="button"
                                 key={schoolClass.id}
                                 onClick={() => onSelectClass(schoolClass)}
                                 style={{
                                    top: `calc(${top}% + 2.5px)`,
                                    height: `calc(${height}% - 5px)`,
                                    width,
                                    left,
                                 }}
                                 title={schoolClass.title}
                                 aria-label={accessibleLabel}
                              >
                                 <ClassStatusMarker status={schoolClass.status} />
                                 <strong>{classLabel}</strong>
                                 <span className="grid-class__meta">
                                    <span className="grid-class__meta-when" title={whenLabel}>
                                       {whenLabel}
                                    </span>
                                    {whereLabel ? (
                                       <span className="grid-class__meta-where" title={whereLabel}>
                                          {whereLabel}
                                       </span>
                                    ) : null}
                                 </span>
                                 <small className="grid-class__extra" title={extraLabel || undefined}>
                                    {extraLabel}
                                 </small>
                              </button>
                           );
                        })}
                     </div>
                  ))}
               </div>
            </div>
         </div>
      </div>
   );
}
