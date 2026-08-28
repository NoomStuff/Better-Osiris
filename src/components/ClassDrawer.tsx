import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { fullDayLabel, parseLocalDateTime, timeLabel } from "../lib/date";
import { normalizeClassField } from "../lib/classFormat";
import type { Class } from "../types/weeks";
import { IconButton } from "./IconButton";
import { OverlayPanel, PANEL_CLOSE_MS } from "./OverlayPanel";
import "./ClassDrawer.css";

interface ClassDrawerProps {
   schoolClass: Class | null;
   onClose: () => void;
}

export function ClassDrawer({ schoolClass, onClose }: ClassDrawerProps) {
   const [displayLesson, setDisplayLesson] = useState<Class | null>(schoolClass);
   const [isClosing, setIsClosing] = useState(false);
   const closeTimerRef = useRef<number | null>(null);

   const closePanel = useCallback(() => {
      if (isClosing) {
         return;
      }

      setIsClosing(true);
      closeTimerRef.current = window.setTimeout(() => {
         setDisplayLesson(null);
         setIsClosing(false);
         onClose();
      }, PANEL_CLOSE_MS);
   }, [isClosing, onClose]);

   useEffect(() => {
      if (!schoolClass) {
         return;
      }

      if (closeTimerRef.current) {
         window.clearTimeout(closeTimerRef.current);
         closeTimerRef.current = null;
      }

      void Promise.resolve().then(() => {
         setDisplayLesson(schoolClass);
         setIsClosing(false);
      });
   }, [schoolClass]);

   useEffect(() => {
      return () => {
         if (closeTimerRef.current) {
            window.clearTimeout(closeTimerRef.current);
         }
      };
   }, []);

   const activeClass = schoolClass === null && !isClosing ? null : displayLesson;

   if (!activeClass) {
      return null;
   }

   const startDate = parseLocalDateTime(activeClass.start);
   const endDate = parseLocalDateTime(activeClass.end);
   const room = activeClass.room.trim();
   const location = activeClass.location.trim();
   const title = activeClass.title.trim();
   const subtitle = activeClass.subject.trim();
   const details = activeClass.description.trim();
   const showLocation = Boolean(location) && normalizeClassField(location) !== normalizeClassField(room);
   const showDetails =
      Boolean(details) && normalizeClassField(details) !== normalizeClassField(title) && normalizeClassField(details) !== normalizeClassField(subtitle);
   const previous = activeClass.status === "changed" ? activeClass.previous : undefined;
   const previousStartDate = previous ? parseLocalDateTime(previous.start) : null;
   const previousEndDate = previous ? parseLocalDateTime(previous.end) : null;
   const dateValue = fullDayLabel.format(startDate);
   const previousDateValue = previousStartDate ? fullDayLabel.format(previousStartDate) : null;
   const timeValue = formatTimeRange(startDate, endDate);
   const previousTimeValue = previousStartDate && previousEndDate ? formatTimeRange(previousStartDate, previousEndDate) : null;
   const previousRoom = previous?.room.trim() ?? "";
   const previousLocation = previous?.location.trim() ?? "";
   const previousDetails = previous?.description.trim() ?? "";
   const showPreviousLocation = Boolean(previousLocation) && normalizeClassField(previousLocation) !== normalizeClassField(previousRoom);
   const showPreviousDetails =
      Boolean(previousDetails) &&
      normalizeClassField(previousDetails) !== normalizeClassField(previous?.title ?? "") &&
      normalizeClassField(previousDetails) !== normalizeClassField(previous?.subject ?? "");

   return (
      <OverlayPanel
         className="class-panel"
         surfaceClassName="class-panel__card"
         backdropClassName="class-panel__backdrop"
         closeLabel="Close class details"
         label="Class details"
         placement="bottom"
         isClosing={isClosing}
         closeOnSwipeDown
         swipeIgnoreSelector=".class-panel__details"
         onClose={closePanel}
      >
         <div className="class-panel__header">
            <div className="class-panel__title">
               <div className="class-panel__title-line">
                  <h3>{activeClass.title}</h3>
                  {activeClass.status !== "scheduled" ? (
                     <span className={`class-panel__status class-panel__status--${activeClass.status}`}>{activeClass.status}</span>
                  ) : null}
               </div>
               <p>{activeClass.subject}</p>
            </div>
            <IconButton className="class-panel__close" icon="fa-solid fa-xmark" label="Close" tooltipPlacement="bottom" onClick={closePanel} />
         </div>

         <dl className="class-panel__details">
            {previous && previous.title !== activeClass.title ? <ClassDetail label="Title" current={activeClass.title} previous={previous.title} /> : null}
            {previous && previous.subject !== activeClass.subject ? (
               <ClassDetail label="Subject" current={activeClass.subject} previous={previous.subject} />
            ) : null}
            <ClassDetail label="Date" current={dateValue} previous={previousDateValue !== dateValue ? previousDateValue : null} />
            <ClassDetail label="Time" current={timeValue} previous={previousTimeValue !== timeValue ? previousTimeValue : null} />
            <ClassDetail
               label="Teacher"
               current={activeClass.teacher}
               previous={previous && previous.teacher !== activeClass.teacher ? previous.teacher : null}
            />
            <ClassDetail label="Room" current={room || "Not set"} previous={previous && previousRoom !== room ? previousRoom || "Not set" : null} />
            {showLocation || showPreviousLocation ? (
               <ClassDetail
                  label="Location"
                  current={location || "Not set"}
                  previous={previous && previousLocation !== location ? previousLocation || "Not set" : null}
               />
            ) : null}
            {showDetails || showPreviousDetails ? (
               <ClassDetail
                  label="Details"
                  current={details || "Not set"}
                  previous={previous && previousDetails !== details ? previousDetails || "Not set" : null}
               />
            ) : null}
         </dl>
      </OverlayPanel>
   );
}

interface ClassDetailProps {
   label: string;
   current: ReactNode;
   previous: ReactNode | null;
}

function ClassDetail({ label, current, previous }: ClassDetailProps) {
   return (
      <div className={previous === null ? undefined : "class-panel__field--changed"}>
         <dt>{label}</dt>
         <dd>
            {previous === null ? (
               current
            ) : (
               <span className="class-panel__change-values">
                  <s>{previous}</s>
                  <i className="fa-solid fa-arrow-right" aria-hidden="true" />
                  <strong>{current}</strong>
               </span>
            )}
         </dd>
      </div>
   );
}

function formatTimeRange(start: Date, end: Date) {
   return `${timeLabel.format(start)} - ${timeLabel.format(end)}`;
}
