import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { fullDayLabel, parseLocalDateTime, timeLabel } from "../lib/date";
import { normalizeClassField } from "../lib/classFormat";
import { useOverlayScrollbar } from "../hooks/useOverlayScrollbar";
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
   const detailsRef = useOverlayScrollbar();

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
   const teacher = activeClass.teacher.trim();
   const details = activeClass.description.trim();
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
   const previousTeacher = previous?.teacher.trim() ?? "";
   const previousDetails = previous?.description.trim() ?? "";
   const showPreviousDetails =
      Boolean(previousDetails) &&
      normalizeClassField(previousDetails) !== normalizeClassField(previous?.title ?? "") &&
      normalizeClassField(previousDetails) !== normalizeClassField(previous?.subject ?? "");
   const place = getPlaceDisplay(room, location);
   const previousPlace = previous ? getPlaceDisplay(previousRoom, previousLocation) : null;
   const locationChanged = Boolean(previous && (room || previousRoom) && previousLocation !== location);
   const placeContext = locationChanged ? location || "Not set" : place.context;
   const previousPlaceContext = locationChanged ? previousLocation || "Not set" : null;
   const previousPlaceValue = previousPlace && previousPlace.value !== place.value ? previousPlace.value : null;
   const placeChanged = Boolean(previous && (previousRoom !== room || previousLocation !== location));
   const teacherValue = teacher || "Not set";
   const previousTeacherValue = previous && previousTeacher !== teacher ? previousTeacher || "Not set" : null;
   const isCancelled = activeClass.status === "cancelled";
   const isAdded = activeClass.status === "added";

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
         swipeIgnoreSelector=".class-panel__content"
         onClose={closePanel}
      >
         <header className="class-panel__header">
            <div className="class-panel__identity">
               <div className="class-panel__title-line">
                  <h2>{title || "Untitled class"}</h2>
                  {activeClass.status !== "scheduled" ? <ClassStatusBadge status={activeClass.status} /> : null}
               </div>
               {subtitle ? <p>{subtitle}</p> : null}
               {previous && previous.title !== activeClass.title ? <PreviousIdentity label="Previous title" value={previous.title} /> : null}
               {previous && previous.subject !== activeClass.subject ? <PreviousIdentity label="Previous subject" value={previous.subject} /> : null}
            </div>
            <IconButton className="class-panel__close" icon="fa-solid fa-xmark" label="Close" tooltipPlacement="bottom" onClick={closePanel} />
         </header>

         <div ref={detailsRef} className="class-panel__content">
            <section className="class-panel__glance" aria-label="Where and when">
               <div className="class-panel__glance-item class-panel__place" data-changed={placeChanged ? "true" : undefined}>
                  <div className="class-panel__glance-context">
                     <i className="fa-solid fa-location-dot" aria-hidden="true" />
                     <ChangeValue current={placeContext} previous={previousPlaceContext} cancelled={isCancelled} />
                  </div>
                  <ChangeValue
                     className="class-panel__glance-value"
                     current={place.value}
                     previous={previousPlaceValue}
                     cancelled={isCancelled}
                     added={isAdded}
                  />
               </div>

               <div
                  className="class-panel__glance-item class-panel__time"
                  data-changed={
                     (previousDateValue !== null && previousDateValue !== dateValue) || (previousTimeValue !== null && previousTimeValue !== timeValue)
                        ? "true"
                        : undefined
                  }
               >
                  <div className="class-panel__glance-context">
                     <i className="fa-regular fa-calendar" aria-hidden="true" />
                     <ChangeValue current={dateValue} previous={previousDateValue !== dateValue ? previousDateValue : null} cancelled={isCancelled} />
                  </div>
                  <ChangeValue
                     className="class-panel__glance-value class-panel__time-value"
                     current={timeValue}
                     previous={previousTimeValue !== timeValue ? previousTimeValue : null}
                     cancelled={isCancelled}
                     added={isAdded}
                  />
               </div>

               <section className="class-panel__teacher" aria-label="Teacher" data-changed={previousTeacherValue === null ? undefined : "true"}>
                  <i className="fa-solid fa-user" aria-hidden="true" />
                  <ChangeValue className="class-panel__support-value" current={teacherValue} previous={previousTeacherValue} />
                  <span className="class-panel__support-label">is teaching</span>
               </section>

               {showDetails || showPreviousDetails ? (
                  <section className="class-panel__notes" aria-label="Details">
                     <i className="fa-solid fa-align-left" aria-hidden="true" />
                     <ChangeValue
                        className="class-panel__notes-value"
                        current={details || "Not set"}
                        previous={previous && previousDetails !== details ? previousDetails || "Not set" : null}
                     />
                  </section>
               ) : null}
            </section>
         </div>
      </OverlayPanel>
   );
}

interface ChangeValueProps {
   className?: string;
   current: ReactNode;
   previous: ReactNode | null;
   cancelled?: boolean;
   added?: boolean;
}

function ChangeValue({ className, current, previous, cancelled = false, added = false }: ChangeValueProps) {
   if (previous === null) {
      if (cancelled) {
         return <s className={["class-panel__cancelled-value", className].filter(Boolean).join(" ")}>{current}</s>;
      }

      if (added) {
         return (
            <span className={["class-panel__added-value", className].filter(Boolean).join(" ")}>
               <i className="fa-solid fa-plus" aria-hidden="true" />
               <strong>{current}</strong>
            </span>
         );
      }

      return <span className={className}>{current}</span>;
   }

   return (
      <span className={["class-panel__change-values", className].filter(Boolean).join(" ")}>
         <s>{previous}</s>
         <i className="fa-solid fa-arrow-right" aria-hidden="true" />
         <strong>{current}</strong>
      </span>
   );
}

function ClassStatusBadge({ status }: { status: Exclude<Class["status"], "scheduled"> }) {
   const icon = status === "added" ? "fa-plus" : status === "changed" ? "fa-pen" : "fa-trash-can";

   return (
      <span className={`class-panel__status class-panel__status--${status}`}>
         <i className={`fa-solid ${icon}`} aria-hidden="true" />
         {status}
      </span>
   );
}

function PreviousIdentity({ label, value }: { label: string; value: string }) {
   return (
      <p className="class-panel__identity-history">
         <span>{label}</span>
         <s>{value || "Not set"}</s>
      </p>
   );
}

function formatTimeRange(start: Date, end: Date) {
   return `${timeLabel.format(start)} – ${timeLabel.format(end)}`;
}

function getPlaceDisplay(room: string, location: string) {
   if (!room) {
      return { context: location ? "Location" : "Room", value: location || "Not set" };
   }

   const hasDistinctLocation = Boolean(location) && normalizeClassField(location) !== normalizeClassField(room);
   return { context: hasDistinctLocation ? location : "Room", value: room };
}
