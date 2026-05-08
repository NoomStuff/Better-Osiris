import { useEffect, useRef, useState, type MouseEvent } from "react";
import { dayShortLabel, getMinutesFromMidnight, timeLabel, toDayKey } from "../lib/date";
import { WORKDAY_END, WORKDAY_START } from "../lib/rosterLayout";
import type { DayGroup, GridZoom, Lesson } from "../types/roster";
import "./GridView.css";

interface GridViewProps {
   groups: DayGroup[];
   zoom: GridZoom;
   onSelectLesson: (lesson: Lesson) => void;
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

function formatLocation(lesson: Lesson) {
   const room = lesson.room.trim();
   const location = lesson.location.trim();

   if (room && location) {
      return room.toLowerCase() === location.toLowerCase() ? room : `${room} · ${location}`;
   }

   return room || location || "";
}

function formatMinutes(minutes: number) {
   const hour = Math.floor(minutes / 60);
   const minute = minutes % 60;
   return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function getOffsetPercent(minutes: number) {
   return ((minutes - WORKDAY_START) / WORKDAY_RANGE) * 100;
}

function clamp(value: number, min: number, max: number) {
   return Math.min(Math.max(value, min), max);
}

export function GridView({ groups, zoom: zoomId, onSelectLesson }: GridViewProps) {
   const [hoverGuide, setHoverGuide] = useState<{ top: number; label: string } | null>(null);
   const [animateZoom, setAnimateZoom] = useState(false);
   const [contentHeight, setContentHeight] = useState(0);
   const previousZoomRef = useRef<GridZoom | null>(null);
   const contentRef = useRef<HTMLDivElement | null>(null);
   const zoom = zoomOptions.find((option) => option.id === zoomId) ?? zoomOptions[0];
   const todayKey = toDayKey(new Date());

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

   const updateHoverGuide = (event: MouseEvent<HTMLDivElement>) => {
      const rect = event.currentTarget.getBoundingClientRect();
      const height = event.currentTarget.offsetHeight;
      const y = clamp(event.clientY - rect.top, 0, height);
      const minutes = clamp(Math.round(WORKDAY_START + (y / height) * WORKDAY_RANGE), WORKDAY_START, WORKDAY_END);

      setHoverGuide({
         top: getOffsetPercent(minutes),
         label: formatMinutes(minutes),
      });
   };

   return (
      <section className="grid-view">
         <div className="grid-shell">
            <div className="grid-header">
               <div className="grid-header__time" />
               {groups.map((group) => (
                  <div className="grid-header__day" data-today={group.key === todayKey} data-empty={group.lessons.length === 0} key={group.key}>
                     <span className="grid-header__day-pill">
                        <span>{dayShortLabel.format(group.date)}</span>
                        <strong>{String(group.date.getDate()).padStart(2, "0")}</strong>
                     </span>
                  </div>
               ))}
            </div>

            <div
               className="grid-body"
               data-animate={animateZoom}
               onAnimationEnd={() => setAnimateZoom(false)}
               onMouseMove={updateHoverGuide}
               onMouseLeave={() => setHoverGuide(null)}
            >
               <div className="grid-scroll-content" ref={contentRef}>
                  {hoverGuide ? (
                     <div className="grid-hover-guide" style={{ top: `${hoverGuide.top}%` }}>
                        <span>{hoverGuide.label}</span>
                     </div>
                  ) : null}

                  <div className="grid-time-column">
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

                  <div className="grid-days">
                     {groups.map((group) => (
                        <div className="grid-day-column" key={group.key}>
                           {TIME_MARKS.map((minutes) => (
                              <div
                                 className="grid-line"
                                 key={minutes}
                                 data-major={minutes % 60 === 0}
                                 data-visible={minutes % zoom.interval === 0}
                                 style={{ top: `${getOffsetPercent(minutes)}%` }}
                              />
                           ))}

                           {group.lessons.length === 0
                              ? null
                              : group.lessons.map((lesson) => {
                                   const start = getMinutesFromMidnight(lesson.startDate);
                                   const end = getMinutesFromMidnight(lesson.endDate);
                                   const duration = end - start;
                                   const top = getOffsetPercent(start);
                                   const height = (duration / WORKDAY_RANGE) * 100;
                                   const width = `calc(${100 / lesson.overlapCount}% - 5px)`;
                                   const left = `calc(${(100 / lesson.overlapCount) * lesson.overlapIndex}% + 2.5px)`;
                                   const visibleHeight = (duration / WORKDAY_RANGE) * contentHeight;
                                   const isCompact = visibleHeight > 0 && visibleHeight < 85;
                                   const densityClass = isCompact ? "is-tight" : "is-roomy";
                                   const timeRange = `${timeLabel.format(lesson.startDate)}-${timeLabel.format(lesson.endDate)}`;
                                   const classLabel = lesson.title || lesson.subject;
                                   const subtitleLabel = lesson.subject;
                                   const roomLabel = lesson.room.trim();
                                   const locationLabel = lesson.location.trim();
                                   const hasSameLocation =
                                      Boolean(roomLabel) && Boolean(locationLabel) && roomLabel.toLowerCase() === locationLabel.toLowerCase();
                                   const roomLocationLabel = formatLocation(lesson);
                                   const showLocation = !isCompact && Boolean(roomLocationLabel);
                                   const compactParts = [timeRange];
                                   if (roomLabel) {
                                      compactParts.push(roomLabel);
                                   }
                                   if (locationLabel && !hasSameLocation) {
                                      compactParts.push(locationLabel);
                                   }
                                   const compactMeta = compactParts.join(" · ");

                                   return (
                                      <button
                                         className={`grid-lesson ${densityClass} status-${lesson.status}`}
                                         type="button"
                                         key={lesson.id}
                                         onClick={() => onSelectLesson(lesson)}
                                         style={{
                                            top: `calc(${top}% + 2.5px)`,
                                            height: `calc(${height}% - 5px)`,
                                            width,
                                            left,
                                         }}
                                         title={lesson.title}
                                      >
                                         <strong>{classLabel}</strong>
                                         {subtitleLabel ? <span className="grid-lesson__title">{subtitleLabel}</span> : null}
                                         <span className="grid-lesson__meta">
                                            {showLocation ? <small className="grid-lesson__meta-place">{roomLocationLabel}</small> : null}
                                            <small className="grid-lesson__meta-time">{timeRange}</small>
                                            <small className="grid-lesson__meta-compact">{compactMeta}</small>
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
      </section>
   );
}
