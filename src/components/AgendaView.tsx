import { Fragment, useCallback, useLayoutEffect, useRef, useState } from "react";
import { dayLabel, monthDayLabel, timeLabel, toDayKey } from "../lib/date";
import { DETAILS_SEPARATOR, getClassLocationLabel } from "../lib/classFormat";
import { getBreakIcon, getEmptyDayMessage, getEmptyTodayMessage } from "../lib/flavor";
import type { Day, Class, PositionedClass } from "../types/weeks";
import "./AgendaView.css";

interface AgendaViewProps {
   days: Day[];
   expandedDays: Set<string>;
   animate: boolean;
   now: Date;
   onToggleDay: (dayKey: string) => void;
   onSelectClass: (schoolClass: Class) => void;
}

const MINUTE_MS = 60 * 1000;
const CURRENT_INDICATOR_MIN_HEIGHT = 8;
const CURRENT_INDICATOR_MAX_HEIGHT = 32;
const CURRENT_INDICATOR_CLASS_INSET = 28;
const CURRENT_INDICATOR_BREAK_INSET = 12;

type CurrentAgendaSegment =
   | {
        type: "schoolClass";
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

function getBreaktimeLabel(previousClass: PositionedClass, nextClass: PositionedClass): string | null {
   const breakMinutes = Math.round((nextClass.startDate.getTime() - previousClass.endDate.getTime()) / MINUTE_MS);

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

function getBreaktimeKey(previousClass: PositionedClass, nextClass: PositionedClass): string {
   return `${previousClass.id}--${nextClass.id}`;
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

function getCurrentAgendaSegment(days: Day[], now: Date): CurrentAgendaSegment | null {
   const todayKey = toDayKey(now);
   const todayGroup = days.find((group) => group.key === todayKey);

   if (!todayGroup) {
      return null;
   }

   const nowTime = now.getTime();

   for (let index = 0; index < todayGroup.classes.length; index += 1) {
      const schoolClass = todayGroup.classes[index];
      const nextClass = todayGroup.classes[index + 1];

      if (!schoolClass) {
         continue;
      }

      if (nowTime >= schoolClass.startDate.getTime() && nowTime < schoolClass.endDate.getTime()) {
         return {
            type: "schoolClass",
            key: schoolClass.id,
            startDate: schoolClass.startDate,
            endDate: schoolClass.endDate,
         };
      }

      if (nextClass && nowTime >= schoolClass.endDate.getTime() && nowTime < nextClass.startDate.getTime()) {
         return {
            type: "break",
            key: getBreaktimeKey(schoolClass, nextClass),
            startDate: schoolClass.endDate,
            endDate: nextClass.startDate,
         };
      }
   }

   return null;
}

function getTodayProgressAnchor(days: Day[], now: Date): "before-first" | "after-last" | null {
   const todayKey = toDayKey(now);
   const todayGroup = days.find((group) => group.key === todayKey);
   const firstClass = todayGroup?.classes[0];
   const lastClass = todayGroup?.classes[todayGroup.classes.length - 1];

   if (!firstClass || !lastClass) {
      return null;
   }

   const nowTime = now.getTime();

   if (nowTime < firstClass.startDate.getTime()) {
      return "before-first";
   }

   if (nowTime >= lastClass.endDate.getTime()) {
      return "after-last";
   }

   return null;
}

export function AgendaView({ days, expandedDays, animate, now, onToggleDay, onSelectClass }: AgendaViewProps) {
   const agendaRef = useRef<HTMLElement | null>(null);
   const [indicatorPlacement, setIndicatorPlacement] = useState<CurrentIndicatorPlacement | null>(null);
   const todayKey = toDayKey(now);

   const measureIndicator = useCallback(() => {
      const agendaElement = agendaRef.current;
      if (!agendaElement) {
         return;
      }

      const activeDayKey = toDayKey(now);
      const todayGroup = days.find((group) => group.key === activeDayKey);
      const todayBodyElement = agendaElement.querySelector<HTMLElement>(`[data-day="${CSS.escape(activeDayKey)}"] .day-group__body-inner`);
      const activeSegment = getCurrentAgendaSegment(days, now);
      const todayExpanded = expandedDays.has(activeDayKey);
      const selector = activeSegment ? `[data-current-segment="${CSS.escape(activeSegment.key)}"]` : null;
      const targetElement = selector && todayBodyElement ? todayBodyElement.querySelector<HTMLElement>(selector) : null;
      const progress = getSegmentProgress(activeSegment, now);

      if (activeSegment && targetElement && todayBodyElement && todayExpanded) {
         const bodyRect = todayBodyElement.getBoundingClientRect();
         const targetRect = targetElement.getBoundingClientRect();
         const inset = activeSegment.type === "break" ? CURRENT_INDICATOR_BREAK_INSET : CURRENT_INDICATOR_CLASS_INSET;
         const height = Math.max(CURRENT_INDICATOR_MIN_HEIGHT, Math.min(CURRENT_INDICATOR_MAX_HEIGHT, targetRect.height - inset));
         const top = targetRect.top - bodyRect.top + (targetRect.height - height) / 2;

         setIndicatorPlacement({ visible: true, top, height, progress });
         return;
      }

      const anchor = getTodayProgressAnchor(days, now);
      const anchorClass = anchor === "before-first" ? todayGroup?.classes[0] : todayGroup?.classes.at(-1);
      const anchorElement =
         anchorClass && todayBodyElement ? todayBodyElement.querySelector<HTMLElement>(`[data-current-segment="${CSS.escape(anchorClass.id)}"]`) : null;

      if (anchorElement && todayBodyElement && todayExpanded) {
         const bodyRect = todayBodyElement.getBoundingClientRect();
         const anchorRect = anchorElement.getBoundingClientRect();
         const height = Math.max(CURRENT_INDICATOR_MIN_HEIGHT, Math.min(CURRENT_INDICATOR_MAX_HEIGHT, anchorRect.height - CURRENT_INDICATOR_CLASS_INSET));
         const top = anchor === "before-first" ? anchorRect.top - bodyRect.top - height - 8 : anchorRect.bottom - bodyRect.top + 8;

         setIndicatorPlacement({ visible: false, top, height, progress: 0 });
         return;
      }

      setIndicatorPlacement((current) => (current ? { ...current, visible: false, progress: 0 } : null));
   }, [expandedDays, days, now]);

   useLayoutEffect(() => {
      const agendaElement = agendaRef.current;
      if (!agendaElement) {
         return undefined;
      }
      measureIndicator();

      const resizeObserver = new ResizeObserver(measureIndicator);
      resizeObserver.observe(agendaElement);
      window.addEventListener("resize", measureIndicator);

      return () => {
         resizeObserver.disconnect();
         window.removeEventListener("resize", measureIndicator);
      };
   }, [measureIndicator]);

   return (
      <section className="agenda-view" ref={agendaRef} aria-label="Weekly agenda">
         {days.map((group) => {
            const expanded = expandedDays.has(group.key);
            const countLabel = group.classes.length === 0 ? "empty" : `${group.classes.length} class${group.classes.length === 1 ? "" : "es"}`;
            const isToday = group.key === todayKey;
            const emptyTodayMessage = isToday ? getEmptyTodayMessage(group.key) : null;

            return (
               <section
                  className="day-group"
                  data-day={group.key}
                  data-animate={animate}
                  data-expanded={expanded}
                  data-today={isToday}
                  data-empty={group.classes.length === 0}
                  key={group.key}
               >
                  <h3 className="day-group__heading">
                     <button className="day-group__header" type="button" onClick={() => onToggleDay(group.key)} aria-expanded={expanded}>
                        <span className="day-group__daymark">
                           <span className="day-group__weekday">{dayLabel.format(group.date)}</span>
                           <span className="day-group__date">{monthDayLabel.format(group.date)}</span>
                        </span>

                        <span className="day-group__meta">
                           <span>{countLabel}</span>
                           <i className="fa-solid fa-chevron-down day-group__chevron" />
                        </span>
                     </button>
                  </h3>

                  <div className="day-group__body" aria-hidden={!expanded} inert={!expanded ? true : undefined}>
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

                        {group.classes.length === 0 ? (
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
                           group.classes.map((schoolClass, classIndex) => {
                              const locationLabel = getClassLocationLabel(schoolClass);
                              const teacherLocationLabel = locationLabel ? `${schoolClass.teacher}${DETAILS_SEPARATOR}${locationLabel}` : schoolClass.teacher;
                              const previousClass = group.classes[classIndex - 1];
                              const breaktimeLabel = previousClass ? getBreaktimeLabel(previousClass, schoolClass) : null;
                              const breaktimeKey = previousClass ? getBreaktimeKey(previousClass, schoolClass) : null;
                              const breakIcon = previousClass ? getBreakIcon(previousClass.endDate, schoolClass.startDate, classIndex) : "";

                              return (
                                 <Fragment key={schoolClass.id}>
                                    {breaktimeLabel && breaktimeKey ? (
                                       <div className="agenda-breaktime" role="note" data-current-segment={breaktimeKey}>
                                          <span className="agenda-breaktime__line" aria-hidden="true" />
                                          <span className="agenda-breaktime__label">
                                             <i className={breakIcon} aria-hidden="true" />
                                             {breaktimeLabel}
                                          </span>
                                          <span className="agenda-breaktime__line" aria-hidden="true" />
                                       </div>
                                    ) : null}

                                    <button
                                       className={`agenda-class status-${schoolClass.status}`}
                                       type="button"
                                       data-current-segment={schoolClass.id}
                                       onClick={() => onSelectClass(schoolClass)}
                                    >
                                       <div className="agenda-class__time">
                                          <span>{timeLabel.format(schoolClass.startDate)}</span>
                                          <span>{timeLabel.format(schoolClass.endDate)}</span>
                                       </div>

                                       <div className="agenda-class__body">
                                          <strong title={schoolClass.title}>{schoolClass.title}</strong>
                                          <p title={schoolClass.subject}>{schoolClass.subject}</p>
                                          <small title={teacherLocationLabel}>{teacherLocationLabel}</small>
                                       </div>

                                       <i className="fa-solid fa-angle-right agenda-class__icon" />
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
