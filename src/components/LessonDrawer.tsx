import { useEffect, useRef, useState, type TouchEvent } from "react";
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
         window.clearTimeout(closeTimerRef.current);
         closeTimerRef.current = null;
      }

      window.queueMicrotask(() => {
         setDisplayLesson(lesson);
         setIsClosing(false);
      });
   }, [lesson]);

   useEffect(() => {
      if (!displayLesson) {
         return;
      }

      const previousOverflow = document.body.style.overflow;
      const previousOverscrollBehavior = document.body.style.overscrollBehavior;
      document.body.style.overflow = "hidden";
      document.body.style.overscrollBehavior = "contain";

      return () => {
         document.body.style.overflow = previousOverflow;
         document.body.style.overscrollBehavior = previousOverscrollBehavior;
      };
   }, [displayLesson]);

   useEffect(() => {
      return () => {
         if (closeTimerRef.current) {
            window.clearTimeout(closeTimerRef.current);
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
      closeTimerRef.current = window.setTimeout(() => {
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
                  <dd>{displayLesson.room}</dd>
               </div>
               <div>
                  <dt>Location</dt>
                  <dd>{displayLesson.location}</dd>
               </div>
               <div>
                  <dt>Status</dt>
                  <dd>{displayLesson.status}</dd>
               </div>
               <div>
                  <dt>Details</dt>
                  <dd>{displayLesson.description}</dd>
               </div>
            </dl>
         </div>
      </aside>
   );
}

function isScrollablePopoverTarget(target: EventTarget) {
   return target instanceof Element && Boolean(target.closest(".lesson-panel__details"));
}
