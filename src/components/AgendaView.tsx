import { Fragment } from "react";
import { dayLabel, monthDayLabel, timeLabel, toDayKey } from "../lib/date";
import { DETAILS_SEPARATOR, getLessonLocationLabel } from "../lib/lessonFormat";
import type { DayGroup, Lesson, PositionedLesson } from "../types/roster";
import "./AgendaView.css";

interface AgendaViewProps {
   groups: DayGroup[];
   expandedDays: Set<string>;
   animate: boolean;
   onToggleDay: (dayKey: string) => void;
   onSelectLesson: (lesson: Lesson) => void;
}

const MINUTE_MS = 60 * 1000;

function getBreaktimeLabel(previousLesson: PositionedLesson, nextLesson: PositionedLesson): string | null {
   const breakMinutes = Math.round((nextLesson.startDate.getTime() - previousLesson.endDate.getTime()) / MINUTE_MS);

   if (breakMinutes <= 0) {
      return null;
   }

   if (breakMinutes < 60) {
      return `${breakMinutes} min break`;
   }

   const hours = Math.floor(breakMinutes / 60);
   const minutes = breakMinutes % 60;
   const hourLabel = `${hours} hr${hours === 1 ? "" : "s"}`;

   return minutes === 0 ? `${hourLabel} break` : `${hourLabel} ${minutes} min break`;
}

export function AgendaView({ groups, expandedDays, animate, onToggleDay, onSelectLesson }: AgendaViewProps) {
   const todayKey = toDayKey(new Date());

   return (
      <section className="agenda-view">
         {groups.map((group) => {
            const expanded = expandedDays.has(group.key);
            const countLabel = group.lessons.length === 0 ? "empty" : `${group.lessons.length} class${group.lessons.length === 1 ? "" : "es"}`;
            const isToday = group.key === todayKey;

            return (
               <section
                  className="day-group"
                  data-day={group.key}
                  data-animate={animate}
                  data-expanded={expanded}
                  data-today={isToday}
                  data-empty={group.lessons.length === 0}
                  key={group.key}
               >
                  <button className="day-group__header" type="button" onClick={() => onToggleDay(group.key)} aria-expanded={expanded}>
                     <span className="day-group__daymark">
                        <span className="day-group__weekday">{dayLabel.format(group.date)}</span>
                        <span className="day-group__date">{monthDayLabel.format(group.date)}</span>
                     </span>

                     <div className="day-group__meta">
                        <span>{countLabel}</span>
                        <i className="fa-solid fa-chevron-down day-group__chevron" />
                     </div>
                  </button>

                  <div className="day-group__body" aria-hidden={!expanded}>
                     <div className="day-group__body-inner">
                        {group.lessons.length === 0 ? (
                           <p className="empty-state">No classes scheduled.</p>
                        ) : (
                           group.lessons.map((lesson, lessonIndex) => {
                              const locationLabel = getLessonLocationLabel(lesson);
                              const teacherLocationLabel = locationLabel ? `${lesson.teacher}${DETAILS_SEPARATOR}${locationLabel}` : lesson.teacher;
                              const previousLesson = group.lessons[lessonIndex - 1];
                              const breaktimeLabel = previousLesson ? getBreaktimeLabel(previousLesson, lesson) : null;

                              return (
                                 <Fragment key={lesson.id}>
                                    {breaktimeLabel ? (
                                       <div className="agenda-breaktime" aria-label={breaktimeLabel}>
                                          <span className="agenda-breaktime__line" aria-hidden="true" />
                                          <span className="agenda-breaktime__label">
                                             <i className="fa-solid fa-mug-hot" aria-hidden="true" />
                                             {breaktimeLabel}
                                          </span>
                                          <span className="agenda-breaktime__line" aria-hidden="true" />
                                       </div>
                                    ) : null}

                                    <button className={`agenda-lesson status-${lesson.status}`} type="button" onClick={() => onSelectLesson(lesson)}>
                                       <div className="agenda-lesson__time">
                                          <span>{timeLabel.format(lesson.startDate)}</span>
                                          <span>{timeLabel.format(lesson.endDate)}</span>
                                       </div>

                                       <div className="agenda-lesson__body">
                                          <strong title={lesson.title}>{lesson.title}</strong>
                                          <p title={lesson.subject}>{lesson.subject}</p>
                                          <small title={teacherLocationLabel}>{teacherLocationLabel}</small>
                                       </div>

                                       <i className="fa-solid fa-angle-right agenda-lesson__icon" />
                                    </button>
                                 </Fragment>
                              );
                           })
                        )}
                     </div>
                  </div>
               </section>
            );
         })}
      </section>
   );
}
