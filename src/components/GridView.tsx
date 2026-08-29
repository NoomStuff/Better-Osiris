import { useEffect, useRef, useState, type CSSProperties, type MouseEvent } from "react";
import { dayShortLabel, fullDayLabel, getMinutesFromMidnight, timeLabel, toDayKey } from "../lib/date";
import { clamp } from "../lib/clamp";
import { DETAILS_SEPARATOR, getClassLocationLabel } from "../lib/classFormat";
import { WORKDAY_END, WORKDAY_START } from "../lib/weekLayout";
import type { Day, GridZoom, Class } from "../types/weeks";
import "./GridView.css";

interface GridViewProps {
   days: Day[];
   zoom: GridZoom;
   now: Date;
   onSelectClass: (schoolClass: Class) => void;
}

const zoomOptions = [
   { id: "hour", interval: 60 },
   { id: "half", interval: 30 },
   { id: "quarter", interval: 15 },
] as const;

const WORKDAY_RANGE = WORKDAY_END - WORKDAY_START;
const BASE_INTERVAL = zoomOptions[2].interval;
const TIME_MARKS = Array.from({ length: Math.floor(WORKDAY_RANGE / BASE_INTERVAL) + 1 }, (_, index) => WORKDAY_START + index * BASE_INTERVAL);
const TIME_LABELS = TIME_MARKS.filter((minutes) => minutes !== WORKDAY_START && minutes !== WORKDAY_END);
/** Below this rendered height a schoolClass switches to the compact one-line layout. */
const COMPACT_HEIGHT_PX = 85;
/** Below this rendered height even the compact layout drops the room label. */
const TINY_HEIGHT_PX = 64;
/** Per-second rate of the hover guide's chase toward the cursor; about 95% of the way in 170ms. */
const GUIDE_CHASE_RATE = 18;
/** How close the hover guide must be to its target, in percent of the grid height, to count as arrived. */
const GUIDE_SETTLE_PERCENT = 0.01;

type GridStyle = CSSProperties & { "--grid-day-count": number };

function formatMinutes(minutes: number) {
   const hour = Math.floor(minutes / 60);
   const minute = minutes % 60;
   return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function getOffsetPercent(minutes: number) {
   return ((minutes - WORKDAY_START) / WORKDAY_RANGE) * 100;
}

export function GridView({ days, zoom: zoomId, now, onSelectClass }: GridViewProps) {
   const [animateZoom, setAnimateZoom] = useState(false);
   const [contentHeight, setContentHeight] = useState(0);
   const previousZoomRef = useRef<GridZoom | null>(null);
   const contentRef = useRef<HTMLDivElement | null>(null);
   const guideElementRef = useRef<HTMLDivElement | null>(null);
   const guideLabelRef = useRef<HTMLSpanElement | null>(null);
   const guideMotion = useRef({ top: 0, target: 0, visible: false, frame: 0, lastTime: 0 });
   const zoom = zoomOptions.find((option) => option.id === zoomId) ?? zoomOptions[0];
   const todayKey = toDayKey(now);
   const nowMinutes = getMinutesFromMidnight(now);
   const todayIndex = days.findIndex((group) => group.key === todayKey);
   const showNowLine = todayIndex >= 0 && nowMinutes >= WORKDAY_START && nowMinutes <= WORKDAY_END;
   const nowLineTop = getOffsetPercent(clamp(nowMinutes, WORKDAY_START, WORKDAY_END));

   useEffect(() => () => cancelAnimationFrame(guideMotion.current.frame), []);

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

   const renderGuide = () => {
      const motion = guideMotion.current;
      const element = guideElementRef.current;
      if (!element) {
         return;
      }
      element.style.top = `${motion.top}%`;
      if (guideLabelRef.current) {
         const minutes = clamp(Math.round(WORKDAY_START + (motion.top / 100) * WORKDAY_RANGE), WORKDAY_START, WORKDAY_END);
         guideLabelRef.current.textContent = formatMinutes(minutes);
      }
   };

   const stepGuide = (time: number) => {
      const motion = guideMotion.current;
      motion.frame = 0;
      if (!motion.lastTime) {
         motion.lastTime = time;
      }
      const delta = Math.min((time - motion.lastTime) / 1000, 0.1);
      motion.lastTime = time;
      motion.top += (motion.target - motion.top) * (1 - Math.exp(-GUIDE_CHASE_RATE * delta));
      if (Math.abs(motion.target - motion.top) < GUIDE_SETTLE_PERCENT) {
         motion.top = motion.target;
      }
      renderGuide();
      if (motion.top !== motion.target) {
         motion.frame = requestAnimationFrame(stepGuide);
      }
   };

   const animateGuide = () => {
      const motion = guideMotion.current;
      if (motion.frame) {
         return;
      }
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
         motion.top = motion.target;
         renderGuide();
         return;
      }
      motion.lastTime = 0;
      motion.frame = requestAnimationFrame(stepGuide);
   };

   const updateHoverGuide = (event: MouseEvent<HTMLDivElement>) => {
      const rect = event.currentTarget.getBoundingClientRect();
      const height = event.currentTarget.clientHeight;
      const y = clamp(event.clientY - rect.top, 0, height);
      const minutes = clamp(Math.round(WORKDAY_START + (y / height) * WORKDAY_RANGE), WORKDAY_START, WORKDAY_END);
      const motion = guideMotion.current;
      motion.target = getOffsetPercent(minutes);

      if (!motion.visible) {
         motion.visible = true;
         motion.top = motion.target;
         guideElementRef.current?.style.setProperty("opacity", "1");
      }

      if (motion.top !== motion.target) {
         animateGuide();
      } else {
         renderGuide();
      }
   };

   const clearHoverGuide = () => {
      const motion = guideMotion.current;
      if (!motion.visible) {
         return;
      }
      motion.visible = false;
      guideElementRef.current?.style.setProperty("opacity", "0");
      if (motion.frame) {
         cancelAnimationFrame(motion.frame);
         motion.frame = 0;
      }
   };

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
                  {TIME_LABELS.map((minutes) => (
                     <div
                        className="grid-time-slot"
                        key={minutes}
                        data-major={minutes % 60 === 0}
                        data-visible={minutes % zoom.interval === 0}
                        style={{ top: `${getOffsetPercent(minutes)}%` }}
                     >
                        {formatMinutes(minutes)}
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
                        {TIME_MARKS.map((minutes) => (
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
                           const height = (duration / WORKDAY_RANGE) * 100;
                           const width = `calc(${100 / schoolClass.overlapCount}% - 5px)`;
                           const left = `calc(${(100 / schoolClass.overlapCount) * schoolClass.overlapIndex}% + 2.5px)`;
                           const visibleHeight = (duration / WORKDAY_RANGE) * contentHeight;
                           const isCompact = visibleHeight > 0 && visibleHeight < COMPACT_HEIGHT_PX;
                           const densityClass = isCompact ? "is-tight" : "is-roomy";
                           const timeRange = `${timeLabel.format(schoolClass.startDate)}-${timeLabel.format(schoolClass.endDate)}`;
                           const classLabel = schoolClass.title || schoolClass.subject;
                           const subtitleLabel = schoolClass.subject;
                           const roomLocationLabel = getClassLocationLabel(schoolClass);
                           const showLocation = !isCompact && Boolean(roomLocationLabel);
                           const isTiny = visibleHeight > 0 && visibleHeight < TINY_HEIGHT_PX;
                           const compactParts = [timeRange, roomLocationLabel].filter(Boolean);

                           const accessibleLabel = [
                              classLabel,
                              subtitleLabel,
                              fullDayLabel.format(schoolClass.startDate),
                              timeRange,
                              schoolClass.teacher,
                              roomLocationLabel,
                              schoolClass.status === "scheduled" ? "" : schoolClass.status,
                           ]
                              .filter(Boolean)
                              .join(", ");

                           return (
                              <button
                                 className={`grid-class ${densityClass} ${isCompact ? "is-compact" : ""} ${isTiny ? "is-tiny" : ""} status-${schoolClass.status}`}
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
                                 <strong>{classLabel}</strong>
                                 {subtitleLabel ? <span className="grid-class__title">{subtitleLabel}</span> : null}
                                 <span className="grid-class__meta">
                                    {showLocation ? <small className="grid-class__meta-place">{roomLocationLabel}</small> : null}
                                    <small className="grid-class__meta-time">{timeRange}</small>
                                    <small className="grid-class__meta-compact">{compactParts.join(DETAILS_SEPARATOR)}</small>
                                 </span>
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
