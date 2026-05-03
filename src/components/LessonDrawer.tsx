import { fullDayLabel, parseLocalDateTime, timeLabel } from "../lib/date";
import type { Lesson } from "../types/roster";
import "./LessonDrawer.css";

interface LessonDrawerProps {
   lesson: Lesson | null;
   onClose: () => void;
}

export function LessonDrawer({ lesson, onClose }: LessonDrawerProps) {
   if (!lesson) {
      return null;
   }

   const startDate = parseLocalDateTime(lesson.start);
   const endDate = parseLocalDateTime(lesson.end);

   return (
      <aside className="lesson-panel" aria-hidden={false} onClick={onClose}>
         <div className="lesson-panel__backdrop" />
         <div className="lesson-panel__card" onClick={(event) => event.stopPropagation()}>
            <div className="lesson-panel__header">
               <div className="lesson-panel__title">
                  <h3>{lesson.title}</h3>
                  <p>{lesson.subject}</p>
               </div>
               <button className="icon-button lesson-panel__close" type="button" onClick={onClose} aria-label="Close">
                  <i className="fa-solid fa-xmark" />
               </button>
            </div>

            <dl className="lesson-panel__details">
               <div>
                  <dt>Time</dt>
                  <dd>
                     {fullDayLabel.format(startDate)} · {timeLabel.format(startDate)} - {timeLabel.format(endDate)}
                  </dd>
               </div>
               <div>
                  <dt>Teacher</dt>
                  <dd>{lesson.teacher}</dd>
               </div>
               <div>
                  <dt>Room</dt>
                  <dd>{lesson.room}</dd>
               </div>
               <div>
                  <dt>Location</dt>
                  <dd>{lesson.location}</dd>
               </div>
               <div>
                  <dt>Status</dt>
                  <dd>{lesson.status}</dd>
               </div>
               <div>
                  <dt>Details</dt>
                  <dd>{lesson.description}</dd>
               </div>
            </dl>
         </div>
      </aside>
   );
}
