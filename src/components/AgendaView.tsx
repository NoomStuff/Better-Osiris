import { Fragment, useCallback, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { dayLabel, monthDayLabel, timeLabel, toDayKey } from "../lib/date";
import { DETAILS_SEPARATOR, getClassLocationLabel } from "../lib/classFormat";
import { getBreakIcon, getEmptyDayMessage, getEmptyTodayMessage } from "../lib/flavor";
import type { Day, Class } from "../types/weeks";
import { getBreaktimeLabel, getCurrentAgendaSegment, getDayTimeline, getSegmentProgress, getTodayProgressAnchor, isActiveClass } from "../lib/dayTimeline";
import { useClock } from "../hooks/useClock";
import { ClassStatusMarker } from "./ClassStatusMarker";
import "./AgendaView.css";

interface AgendaViewProps {
   days: Day[];
   expandedDays: Set<string>;
   animate: boolean;
   now: Date;
   timeOverride: Date | null;
   onToggleDay: (dayKey: string) => void;
   onSelectClass: (schoolClass: Class) => void;
}

const CURRENT_INDICATOR_MIN_HEIGHT = 8;
const CURRENT_INDICATOR_MAX_HEIGHT = 32;
const CURRENT_INDICATOR_CLASS_INSET = 28;
const CURRENT_INDICATOR_BREAK_INSET = 12;
interface CurrentIndicatorPlacement {
   visible: boolean;
   top: number;
   height: number;
   progress: number;
}

function AgendaCurrentIndicator({
   days,
   expandedDays,
   agendaRef,
   timeOverride,
}: {
   days: Day[];
   expandedDays: Set<string>;
   agendaRef: RefObject<HTMLElement | null>;
   timeOverride: Date | null;
}) {
   const now = useClock(1000, timeOverride);
   const [indicatorPlacement, setIndicatorPlacement] = useState<CurrentIndicatorPlacement | null>(null);
   const measureIndicator = useCallback(() => {
      const agendaElement = agendaRef.current;
      if (!agendaElement) {
         return;
      }

      const activeDayKey = toDayKey(now);
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
      const anchorClass = anchor?.schoolClass;
      const anchorElement =
         anchorClass && todayBodyElement ? todayBodyElement.querySelector<HTMLElement>(`[data-current-segment="${CSS.escape(anchorClass.id)}"]`) : null;

      if (anchorElement && todayBodyElement && todayExpanded) {
         const bodyRect = todayBodyElement.getBoundingClientRect();
         const anchorRect = anchorElement.getBoundingClientRect();
         const height = Math.max(CURRENT_INDICATOR_MIN_HEIGHT, Math.min(CURRENT_INDICATOR_MAX_HEIGHT, anchorRect.height - CURRENT_INDICATOR_CLASS_INSET));
         const top = anchor?.position === "before-first" ? anchorRect.top - bodyRect.top - height - 8 : anchorRect.bottom - bodyRect.top + 8;

         setIndicatorPlacement({ visible: false, top, height, progress: 0 });
         return;
      }

      setIndicatorPlacement((current) => (current ? { ...current, visible: false, progress: 0 } : null));
   }, [agendaRef, expandedDays, days, now]);

   const measureRef = useRef(measureIndicator);
   useLayoutEffect(() => {
      measureRef.current = measureIndicator;
      measureIndicator();
   }, [measureIndicator]);
   useLayoutEffect(() => {
      const element = agendaRef.current;
      if (!element) return;
      const measure = () => measureRef.current();
      const observer = new ResizeObserver(measure);
      observer.observe(element);
      window.addEventListener("resize", measure);
      return () => {
         observer.disconnect();
         window.removeEventListener("resize", measure);
      };
   }, [agendaRef]);
   if (!indicatorPlacement) return null;
   return (
      <span
         className="agenda-current-indicator"
         aria-hidden="true"
         data-visible={indicatorPlacement.visible}
         style={{ top: `${indicatorPlacement.top}px`, height: `${indicatorPlacement.height}px` }}
      >
         <span className="agenda-current-indicator__progress" style={{ height: `${indicatorPlacement.progress * 100}%` }} />
      </span>
   );
}

export function AgendaView({ days, expandedDays, animate, now, timeOverride, onToggleDay, onSelectClass }: AgendaViewProps) {
   const agendaRef = useRef<HTMLElement | null>(null);
   const todayKey = toDayKey(now);
   return (
      <section className="agenda-view" ref={agendaRef} aria-label="Weekly agenda">
         {days.map((group) => {
            const expanded = expandedDays.has(group.key);
            const timeline = getDayTimeline(group.classes);
            const count = group.classes.filter(isActiveClass).length;
            const countLabel = count === 0 ? "empty" : `${count} class${count === 1 ? "" : "es"}`;
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
                        {isToday ? <AgendaCurrentIndicator days={days} expandedDays={expandedDays} agendaRef={agendaRef} timeOverride={timeOverride} /> : null}
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
                              const breakSegment = timeline.breaksBefore.get(schoolClass.id);
                              const breaktimeLabel = breakSegment ? getBreaktimeLabel(breakSegment) : null;
                              const breaktimeKey = breakSegment?.key;
                              const breakIcon = breakSegment ? getBreakIcon(breakSegment.startDate, breakSegment.endDate, classIndex) : "";

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
                                          <span>
                                             {timeLabel.format(schoolClass.startDate)}
                                             <ClassStatusMarker status={schoolClass.status} />
                                          </span>
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
