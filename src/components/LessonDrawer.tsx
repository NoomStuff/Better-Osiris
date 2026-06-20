import { useCallback, useEffect, useRef, useState } from "react";
import { fullDayLabel, parseLocalDateTime, timeLabel } from "../lib/date";
import { DETAILS_SEPARATOR } from "../lib/lessonFormat";
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
               <h3>{activeLesson.title}</h3>
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
            <div>
               <dt>Time</dt>
               <dd>
                  {fullDayLabel.format(startDate)}
                  {DETAILS_SEPARATOR}
                  {timeLabel.format(startDate)} - {timeLabel.format(endDate)}
               </dd>
            </div>
            <div>
               <dt>Teacher</dt>
               <dd>{activeLesson.teacher}</dd>
            </div>
            <div>
               <dt>Room</dt>
               <dd>{room}</dd>
            </div>
            {showLocation ? (
               <div>
                  <dt>Location</dt>
                  <dd>{location}</dd>
               </div>
            ) : null}
            <div>
               <dt>Status</dt>
               <dd>{activeLesson.status}</dd>
            </div>
            {showDetails ? (
               <div>
                  <dt>Details</dt>
                  <dd>{details}</dd>
               </div>
            ) : null}
         </dl>
      </OverlayPanel>
   );
}

function normalizeField(value: string) {
   return value.trim().toLowerCase();
}
