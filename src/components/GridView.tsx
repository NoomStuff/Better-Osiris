import { useState, type MouseEvent } from "react";
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
   { id: "hour", interval: 60, scale: 1 },
   { id: "half", interval: 30, scale: 2 },
   { id: "quarter", interval: 15, scale: 4 },
] as const;

function formatMinutes(minutes: number) {
   const hour = Math.floor(minutes / 60);
   const minute = minutes % 60;
   return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function getOffsetPercent(minutes: number) {
   return ((minutes - WORKDAY_START) / (WORKDAY_END - WORKDAY_START)) * 100;
}

export function GridView({ groups, zoom: zoomId, onSelectLesson }: GridViewProps) {
   const [hoverGuide, setHoverGuide] = useState<{ top: number; label: string } | null>(null);
   const zoom = zoomOptions.find((option) => option.id === zoomId) ?? zoomOptions[0];
   const timeMarks: number[] = [];
   const todayKey = toDayKey(new Date());

   for (let minutes = WORKDAY_START; minutes <= WORKDAY_END; minutes += zoom.interval) {
      timeMarks.push(minutes);
   }

   const updateHoverGuide = (event: MouseEvent<HTMLDivElement>) => {
      const rect = event.currentTarget.getBoundingClientRect();
      const contentHeight = event.currentTarget.offsetHeight;
      const y = Math.min(Math.max(event.clientY - rect.top, 0), contentHeight);
      const minutes = Math.min(WORKDAY_END, Math.max(WORKDAY_START, Math.round(WORKDAY_START + (y / contentHeight) * (WORKDAY_END - WORKDAY_START))));

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
                  <div className="grid-header__day" data-today={group.key === todayKey} key={group.key}>
                     <span className="grid-header__day-pill">
                        <span>{dayShortLabel.format(group.date)}</span>
                        <strong>{String(group.date.getDate()).padStart(2, "0")}</strong>
                     </span>
                  </div>
               ))}
            </div>

            <div className="grid-body" key={zoomId} onMouseMove={updateHoverGuide} onMouseLeave={() => setHoverGuide(null)}>
               <div className="grid-scroll-content">
                  {hoverGuide ? (
                     <div className="grid-hover-guide" style={{ top: `${hoverGuide.top}%` }}>
                        <span>{hoverGuide.label}</span>
                     </div>
                  ) : null}

                  <div className="grid-time-column">
                     {timeMarks.map((minutes) => (
                        <div className="grid-time-slot" key={minutes} data-major={minutes % 60 === 0} style={{ top: `${getOffsetPercent(minutes)}%` }}>
                           {formatMinutes(minutes)}
                        </div>
                     ))}
                  </div>

                  <div className="grid-days">
                     {groups.map((group) => (
                        <div className="grid-day-column" key={group.key}>
                           {timeMarks.map((minutes) => (
                              <div className="grid-line" key={minutes} data-major={minutes % 60 === 0} style={{ top: `${getOffsetPercent(minutes)}%` }} />
                           ))}

                           {group.lessons.length === 0
                              ? null
                              : group.lessons.map((lesson) => {
                                   const start = getMinutesFromMidnight(lesson.startDate);
                                   const end = getMinutesFromMidnight(lesson.endDate);
                                   const top = getOffsetPercent(start);
                                   const height = ((end - start) / (WORKDAY_END - WORKDAY_START)) * 100;
                                   const width = `calc(${100 / lesson.overlapCount}% - 8px)`;
                                   const left = `calc(${(100 / lesson.overlapCount) * lesson.overlapIndex}% + 4px)`;
                                   const visibleHeight = ((end - start) / (WORKDAY_END - WORKDAY_START)) * 560 * zoom.scale;
                                   const densityClass =
                                      visibleHeight < 48 ? "is-tiny" : visibleHeight < 68 ? "is-tight" : visibleHeight < 92 ? "is-compact" : "is-roomy";

                                   return (
                                      <button
                                         className={`grid-lesson ${densityClass} status-${lesson.status}`}
                                         type="button"
                                         key={lesson.id}
                                         onClick={() => onSelectLesson(lesson)}
                                         style={{
                                            top: `calc(${top}% + 3px)`,
                                            height: `calc(${height}% - 6px)`,
                                            width,
                                            left,
                                         }}
                                         title={lesson.title}
                                      >
                                         <strong>{lesson.subject}</strong>
                                         <span className="grid-lesson__title">{lesson.title}</span>
                                         <span className="grid-lesson__meta">
                                            <small>
                                               {timeLabel.format(lesson.startDate)} - {timeLabel.format(lesson.endDate)}
                                            </small>
                                            <small>{lesson.location || lesson.room}</small>
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
