import { useEffect, useRef, useState, type TouchEvent } from "react";
import { getBrowserDocument, getBrowserWindow } from "../lib/browser";
import { fullDayLabel, parseLocalDateTime, timeLabel } from "../lib/date";
import { DETAILS_SEPARATOR } from "../lib/lessonFormat";
import type { Lesson } from "../types/roster";
import "./LessonDrawer.css";

interface LessonDrawerProps {
   lesson: Lesson | null;
   onClose: () => void;
}

export function LessonDrawer({ lesson, onClose }: LessonDrawerProps) {
   const [displayLesson, setDisplayLesson] = useState<Lesson | null>(lesson);
   const [isClosing, setIsClosing] = useState(false);
   const touchStartYRef = useRef<number | null>(null);
   const closeTimerRef = useRef<number | null>(null);

   useEffect(() => {
      if (!lesson) {
         return;
      }

      if (closeTimerRef.current) {
         getBrowserWindow()?.clearTimeout(closeTimerRef.current);
         closeTimerRef.current = null;
      }

      void Promise.resolve().then(() => {
         setDisplayLesson(lesson);
         setIsClosing(false);
      });
   }, [lesson]);

   useEffect(() => {
      if (!displayLesson) {
         return;
      }

      const appDocument = getBrowserDocument();
      if (!appDocument) {
         return;
      }

      const previousOverflow = appDocument.body.style.overflow;
      const previousOverscrollBehavior = appDocument.body.style.overscrollBehavior;
      appDocument.body.style.overflow = "hidden";
      appDocument.body.style.overscrollBehavior = "contain";

      return () => {
         appDocument.body.style.overflow = previousOverflow;
         appDocument.body.style.overscrollBehavior = previousOverscrollBehavior;
      };
   }, [displayLesson]);

   useEffect(() => {
      return () => {
         if (closeTimerRef.current) {
            getBrowserWindow()?.clearTimeout(closeTimerRef.current);
         }
      };
   }, []);

   if (!displayLesson) {
      return null;
   }

   const closePanel = () => {
      if (isClosing) {
         return;
      }

      setIsClosing(true);
      closeTimerRef.current = (getBrowserWindow()?.setTimeout ?? setTimeout)(() => {
         setDisplayLesson(null);
         setIsClosing(false);
         onClose();
      }, 240);
   };

   const handleTouchStart = (event: TouchEvent<HTMLElement>) => {
      if (isScrollablePopoverTarget(event.target)) {
         touchStartYRef.current = null;
         return;
      }

      touchStartYRef.current = event.touches[0]?.clientY ?? null;
   };

   const handleTouchEnd = (event: TouchEvent<HTMLElement>) => {
      if (isScrollablePopoverTarget(event.target)) {
         touchStartYRef.current = null;
         return;
      }

      const startY = touchStartYRef.current;
      touchStartYRef.current = null;

      if (startY === null) {
         return;
      }

      const endY = event.changedTouches[0]?.clientY ?? startY;
      if (endY - startY > 48) {
         closePanel();
      }
   };

   const startDate = parseLocalDateTime(displayLesson.start);
   const endDate = parseLocalDateTime(displayLesson.end);
   const room = displayLesson.room.trim();
   const location = displayLesson.location.trim();
   const title = displayLesson.title.trim();
   const subtitle = displayLesson.subject.trim();
   const details = displayLesson.description.trim();
   const showLocation = Boolean(location) && normalizeField(location) !== normalizeField(room);
   const showDetails = Boolean(details) && normalizeField(details) !== normalizeField(title) && normalizeField(details) !== normalizeField(subtitle);

   return (
      <aside className="lesson-panel" data-closing={isClosing} onClick={closePanel} onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
         <div className="lesson-panel__backdrop" />
         <div
            className="lesson-panel__card"
            onClick={(event) => event.stopPropagation()}
            onTouchStart={(event) => {
               event.stopPropagation();
               handleTouchStart(event);
            }}
            onTouchEnd={(event) => {
               event.stopPropagation();
               handleTouchEnd(event);
            }}
         >
            <div className="lesson-panel__header">
               <div className="lesson-panel__title">
                  <h3>{displayLesson.title}</h3>
                  <p>{displayLesson.subject}</p>
               </div>
               <button className="icon-button lesson-panel__close" type="button" onClick={closePanel} aria-label="Close">
                  <i className="fa-solid fa-xmark" />
               </button>
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
                  <dd>{displayLesson.teacher}</dd>
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
                  <dd>{displayLesson.status}</dd>
               </div>
               {showDetails ? (
                  <div>
                     <dt>Details</dt>
                     <dd>{details}</dd>
                  </div>
               ) : null}
            </dl>
         </div>
      </aside>
   );
}

function isScrollablePopoverTarget(target: EventTarget) {
   return target instanceof Element && Boolean(target.closest(".lesson-panel__details"));
}

function normalizeField(value: string) {
   return value.trim().toLowerCase();
}
