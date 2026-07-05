import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { fullDayLabel, parseLocalDateTime, timeLabel } from "../lib/date";
import type { Lesson } from "../types/roster";
import { IconButton } from "./IconButton";
import { OverlayPanel } from "./OverlayPanel";
import "./LessonDrawer.css";

interface LessonDrawerProps {
   lesson: Lesson | null;
   onClose: () => void;
}

export function LessonDrawer({ lesson, onClose }: LessonDrawerProps) {
   const [displayLesson, setDisplayLesson] = useState<Lesson | null>(lesson);
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
      }, 240);
   }, [isClosing, onClose]);

   useEffect(() => {
      if (!lesson) {
         return;
      }

      if (closeTimerRef.current) {
         window.clearTimeout(closeTimerRef.current);
         closeTimerRef.current = null;
      }

      void Promise.resolve().then(() => {
         setDisplayLesson(lesson);
         setIsClosing(false);
      });
   }, [lesson]);

   useEffect(() => {
      return () => {
         if (closeTimerRef.current) {
            window.clearTimeout(closeTimerRef.current);
         }
      };
   }, []);

   const activeLesson = lesson === null && !isClosing ? null : displayLesson;

   if (!activeLesson) {
      return null;
   }

   const startDate = parseLocalDateTime(activeLesson.start);
   const endDate = parseLocalDateTime(activeLesson.end);
   const room = activeLesson.room.trim();
   const location = activeLesson.location.trim();
   const title = activeLesson.title.trim();
   const subtitle = activeLesson.subject.trim();
   const details = activeLesson.description.trim();
   const showLocation = Boolean(location) && normalizeField(location) !== normalizeField(room);
   const showDetails = Boolean(details) && normalizeField(details) !== normalizeField(title) && normalizeField(details) !== normalizeField(subtitle);
   const previous = activeLesson.status === "changed" ? activeLesson.previous : undefined;
   const previousStartDate = previous ? parseLocalDateTime(previous.start) : null;
   const previousEndDate = previous ? parseLocalDateTime(previous.end) : null;
   const dateValue = fullDayLabel.format(startDate);
   const previousDateValue = previousStartDate ? fullDayLabel.format(previousStartDate) : null;
   const timeValue = formatTimeRange(startDate, endDate);
   const previousTimeValue = previousStartDate && previousEndDate ? formatTimeRange(previousStartDate, previousEndDate) : null;
   const previousRoom = previous?.room.trim() ?? "";
   const previousLocation = previous?.location.trim() ?? "";
   const previousDetails = previous?.description.trim() ?? "";
   const showPreviousLocation = Boolean(previousLocation) && normalizeField(previousLocation) !== normalizeField(previousRoom);
   const showPreviousDetails =
      Boolean(previousDetails) &&
      normalizeField(previousDetails) !== normalizeField(previous?.title ?? "") &&
      normalizeField(previousDetails) !== normalizeField(previous?.subject ?? "");

   return (
      <OverlayPanel
         className="lesson-panel"
         surfaceClassName="lesson-panel__card"
         backdropClassName="lesson-panel__backdrop"
         closeLabel="Close class details"
         label="Class details"
         placement="bottom"
         isClosing={isClosing}
         closeOnSwipeDown
         swipeIgnoreSelector=".lesson-panel__details"
         onClose={closePanel}
      >
         <div className="lesson-panel__header">
            <div className="lesson-panel__title">
               <div className="lesson-panel__title-line">
                  <h3>{activeLesson.title}</h3>
                  {activeLesson.status !== "scheduled" ? (
                     <span className={`lesson-panel__status lesson-panel__status--${activeLesson.status}`}>{activeLesson.status}</span>
                  ) : null}
               </div>
               <p>{activeLesson.subject}</p>
            </div>
            <IconButton
               className="lesson-panel__close"
               icon="fa-solid fa-xmark"
               label="Close"
               tooltipPlacement="bottom"
               tooltipAlign="end"
               onClick={closePanel}
            />
         </div>

         <dl className="lesson-panel__details">
            {previous && previous.title !== activeLesson.title ? <LessonDetail label="Title" current={activeLesson.title} previous={previous.title} /> : null}
            {previous && previous.subject !== activeLesson.subject ? (
               <LessonDetail label="Subject" current={activeLesson.subject} previous={previous.subject} />
            ) : null}
            <LessonDetail label="Date" current={dateValue} previous={previousDateValue !== dateValue ? previousDateValue : null} />
            <LessonDetail label="Time" current={timeValue} previous={previousTimeValue !== timeValue ? previousTimeValue : null} />
            <LessonDetail
               label="Teacher"
               current={activeLesson.teacher}
               previous={previous && previous.teacher !== activeLesson.teacher ? previous.teacher : null}
            />
            <LessonDetail label="Room" current={room || "Not set"} previous={previous && previousRoom !== room ? previousRoom || "Not set" : null} />
            {showLocation || showPreviousLocation ? (
               <LessonDetail
                  label="Location"
                  current={location || "Not set"}
                  previous={previous && previousLocation !== location ? previousLocation || "Not set" : null}
               />
            ) : null}
            {showDetails || showPreviousDetails ? (
               <LessonDetail
                  label="Details"
                  current={details || "Not set"}
                  previous={previous && previousDetails !== details ? previousDetails || "Not set" : null}
               />
            ) : null}
         </dl>
      </OverlayPanel>
   );
}

function normalizeField(value: string) {
   return value.trim().toLowerCase();
}

interface LessonDetailProps {
   label: string;
   current: ReactNode;
   previous: ReactNode | null;
}

function LessonDetail({ label, current, previous }: LessonDetailProps) {
   return (
      <div className={previous === null ? undefined : "lesson-panel__field--changed"}>
         <dt>{label}</dt>
         <dd>
            {previous === null ? (
               current
            ) : (
               <span className="lesson-panel__change-values">
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
