import { Fragment, useLayoutEffect, useRef, useState } from "react";
import { dayLabel, monthDayLabel, timeLabel, toDayKey } from "../lib/date";
import { DETAILS_SEPARATOR, getLessonLocationLabel } from "../lib/lessonFormat";
import { getBreakIcon, getEmptyDayMessage, getEmptyTodayMessage } from "../lib/rosterFlavor";
import type { DayGroup, Lesson, PositionedLesson } from "../types/roster";
import "./AgendaView.css";

interface AgendaViewProps {
   groups: DayGroup[];
   expandedDays: Set<string>;
   animate: boolean;
   now: Date;
   onToggleDay: (dayKey: string) => void;
   onSelectLesson: (lesson: Lesson) => void;
}

const MINUTE_MS = 60 * 1000;
const CURRENT_INDICATOR_MIN_HEIGHT = 8;
const CURRENT_INDICATOR_MAX_HEIGHT = 32;
const CURRENT_INDICATOR_LESSON_INSET = 28;
const CURRENT_INDICATOR_BREAK_INSET = 12;

type CurrentAgendaSegment =
   | {
        type: "lesson";
        key: string;
        startDate: Date;
        endDate: Date;
     }
   | {
        type: "break";
        key: string;
        startDate: Date;
        endDate: Date;
     };

interface CurrentIndicatorPlacement {
   visible: boolean;
   top: number;
   height: number;
   progress: number;
}

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

function getBreaktimeKey(previousLesson: PositionedLesson, nextLesson: PositionedLesson): string {
   return `${previousLesson.id}--${nextLesson.id}`;
}

function clamp(value: number, min: number, max: number) {
   return Math.min(Math.max(value, min), max);
}

function getSegmentProgress(segment: CurrentAgendaSegment | null, now: Date) {
   if (!segment) {
      return 0;
   }

   const start = segment.startDate.getTime();
   const end = segment.endDate.getTime();
   const duration = end - start;

   if (duration <= 0) {
      return 1;
   }

   return clamp((now.getTime() - start) / duration, 0, 1);
}

function getCurrentAgendaSegment(groups: DayGroup[], now: Date): CurrentAgendaSegment | null {
   const todayKey = toDayKey(now);
   const todayGroup = groups.find((group) => group.key === todayKey);

   if (!todayGroup) {
      return null;
   }

   const nowTime = now.getTime();

   for (let index = 0; index < todayGroup.lessons.length; index += 1) {
      const lesson = todayGroup.lessons[index];
      const nextLesson = todayGroup.lessons[index + 1];

      if (!lesson) {
         continue;
      }

      if (nowTime >= lesson.startDate.getTime() && nowTime < lesson.endDate.getTime()) {
         return {
            type: "lesson",
            key: lesson.id,
            startDate: lesson.startDate,
            endDate: lesson.endDate,
         };
      }

      if (nextLesson && nowTime >= lesson.endDate.getTime() && nowTime < nextLesson.startDate.getTime()) {
         return {
            type: "break",
            key: getBreaktimeKey(lesson, nextLesson),
            startDate: lesson.endDate,
            endDate: nextLesson.startDate,
         };
      }
   }

   return null;
}

function getTodayProgressAnchor(groups: DayGroup[], now: Date): "before-first" | "after-last" | null {
   const todayKey = toDayKey(now);
   const todayGroup = groups.find((group) => group.key === todayKey);
   const firstLesson = todayGroup?.lessons[0];
   const lastLesson = todayGroup?.lessons[todayGroup.lessons.length - 1];

   if (!firstLesson || !lastLesson) {
      return null;
   }

   const nowTime = now.getTime();

   if (nowTime < firstLesson.startDate.getTime()) {
      return "before-first";
   }

   if (nowTime >= lastLesson.endDate.getTime()) {
      return "after-last";
   }

   return null;
}

export function AgendaView({ groups, expandedDays, animate, now, onToggleDay, onSelectLesson }: AgendaViewProps) {
   const agendaRef = useRef<HTMLElement | null>(null);
   const [indicatorPlacement, setIndicatorPlacement] = useState<CurrentIndicatorPlacement | null>(null);
   const todayKey = toDayKey(now);

   useLayoutEffect(() => {
      const agendaElement = agendaRef.current;

      if (!agendaElement) {
         return undefined;
      }

      const measureIndicator = () => {
         const todayBodyElement = agendaElement.querySelector<HTMLElement>(`[data-day="${CSS.escape(toDayKey(now))}"] .day-group__body-inner`);
         const activeSegment = getCurrentAgendaSegment(groups, now);
         const todayExpanded = expandedDays.has(toDayKey(now));
         const selector = activeSegment ? `[data-current-segment="${CSS.escape(activeSegment.key)}"]` : null;
         const targetElement = selector && todayBodyElement ? todayBodyElement.querySelector<HTMLElement>(selector) : null;
         const progress = getSegmentProgress(activeSegment, now);

         if (activeSegment && targetElement && todayBodyElement && todayExpanded) {
            const bodyRect = todayBodyElement.getBoundingClientRect();
            const targetRect = targetElement.getBoundingClientRect();
            const inset = activeSegment.type === "break" ? CURRENT_INDICATOR_BREAK_INSET : CURRENT_INDICATOR_LESSON_INSET;
            const height = Math.max(CURRENT_INDICATOR_MIN_HEIGHT, Math.min(CURRENT_INDICATOR_MAX_HEIGHT, targetRect.height - inset));
            const top = targetRect.top - bodyRect.top + (targetRect.height - height) / 2;

            setIndicatorPlacement({ visible: true, top, height, progress });
            return;
         }

         const anchor = getTodayProgressAnchor(groups, now);
         const firstLesson = groups.find((group) => group.key === toDayKey(now))?.lessons[0];
         const lastLesson = groups.find((group) => group.key === toDayKey(now))?.lessons.at(-1);
         const anchorLesson = anchor === "before-first" ? firstLesson : lastLesson;
         const anchorElement =
            anchorLesson && todayBodyElement ? todayBodyElement.querySelector<HTMLElement>(`[data-current-segment="${CSS.escape(anchorLesson.id)}"]`) : null;

         if (anchorElement && todayBodyElement && todayExpanded) {
            const bodyRect = todayBodyElement.getBoundingClientRect();
            const anchorRect = anchorElement.getBoundingClientRect();
            const height = Math.max(CURRENT_INDICATOR_MIN_HEIGHT, Math.min(CURRENT_INDICATOR_MAX_HEIGHT, anchorRect.height - CURRENT_INDICATOR_LESSON_INSET));
            const top =
               anchor === "before-first"
                  ? anchorRect.top - bodyRect.top - height - 8
                  : anchorRect.bottom - bodyRect.top + 8;

            setIndicatorPlacement({ visible: false, top, height, progress: 0 });
            return;
         }

         setIndicatorPlacement((current) => (current ? { ...current, visible: false, progress: 0 } : null));
      };

      measureIndicator();

      const resizeObserver = new ResizeObserver(measureIndicator);
      resizeObserver.observe(agendaElement);
      window.addEventListener("resize", measureIndicator);

      return () => {
         resizeObserver.disconnect();
         window.removeEventListener("resize", measureIndicator);
      };
   }, [expandedDays, groups, now]);

   return (
      <section className="agenda-view" ref={agendaRef}>
         {groups.map((group) => {
            const expanded = expandedDays.has(group.key);
            const countLabel = group.lessons.length === 0 ? "empty" : `${group.lessons.length} class${group.lessons.length === 1 ? "" : "es"}`;
            const isToday = group.key === todayKey;
            const emptyTodayMessage = isToday ? getEmptyTodayMessage(group.key) : null;

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
                        {isToday && indicatorPlacement ? (
                           <span
                              className="agenda-current-indicator"
                              aria-hidden="true"
                              data-visible={indicatorPlacement.visible}
                              style={{
                                 top: `${indicatorPlacement.top}px`,
                                 height: `${indicatorPlacement.height}px`,
                              }}
                           >
                              <span className="agenda-current-indicator__progress" style={{ height: `${indicatorPlacement.progress * 100}%` }} />
                           </span>
                        ) : null}

                        {group.lessons.length === 0 ? (
                           <div className="empty-state" data-today={isToday}>
                              {emptyTodayMessage ? (
                                 <>
                                    <i className={emptyTodayMessage.icon} aria-hidden="true" />
                                    <span className="empty-state__divider" aria-hidden="true" />
                                 </>
                              ) : null}
                              <span className="empty-state__copy">
                                 {emptyTodayMessage ? <strong>{emptyTodayMessage.title}</strong> : <span>{getEmptyDayMessage()}</span>}
                                 {emptyTodayMessage ? <span>{emptyTodayMessage.detail}</span> : null}
                              </span>
                           </div>
                        ) : (
                           group.lessons.map((lesson, lessonIndex) => {
                              const locationLabel = getLessonLocationLabel(lesson);
                              const teacherLocationLabel = locationLabel ? `${lesson.teacher}${DETAILS_SEPARATOR}${locationLabel}` : lesson.teacher;
                              const previousLesson = group.lessons[lessonIndex - 1];
                              const breaktimeLabel = previousLesson ? getBreaktimeLabel(previousLesson, lesson) : null;
                              const breaktimeKey = previousLesson ? getBreaktimeKey(previousLesson, lesson) : null;
                              const breakIcon = previousLesson ? getBreakIcon(previousLesson.endDate, lesson.startDate, lessonIndex) : "";

                              return (
                                 <Fragment key={lesson.id}>
                                    {breaktimeLabel && breaktimeKey ? (
                                       <div className="agenda-breaktime" aria-label={breaktimeLabel} data-current-segment={breaktimeKey}>
                                          <span className="agenda-breaktime__line" aria-hidden="true" />
                                          <span className="agenda-breaktime__label">
                                             <i className={breakIcon} aria-hidden="true" />
                                             {breaktimeLabel}
                                          </span>
                                          <span className="agenda-breaktime__line" aria-hidden="true" />
                                       </div>
                                    ) : null}

                                    <button
                                       className={`agenda-lesson status-${lesson.status}`}
                                       type="button"
                                       data-current-segment={lesson.id}
                                       onClick={() => onSelectLesson(lesson)}
                                    >
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
