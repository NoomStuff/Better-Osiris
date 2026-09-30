import { useId, useMemo, useRef, useState, type CSSProperties, type MouseEvent, type PointerEvent } from "react";
import { clamp } from "../lib/clamp";
import { DETAILS_SEPARATOR, getClassLabel } from "../lib/classFormat";
import { timeLabel } from "../lib/date";
import { collectNextUpEntries, getNextUpDayLabel, getNextUpSuggestion } from "../lib/nextUp";
import { useClock } from "../hooks/useClock";
import { ClassStatusMarker } from "./ClassStatusMarker";
import "./NextUpCard.css";
import type { Class, Week } from "../types/weeks";

interface NextUpCardProps {
   weeks: Week[];
   timeOverride: Date | null;
   isOpen: boolean;
   onChangeOpen: (open: boolean) => void;
   onSelectClass: (schoolClass: Class) => void;
}

const REVEAL_DISTANCE_PX = 130;
const OPEN_THRESHOLD = 0.35;
const TAP_SLOP_PX = 6;
const CLOSED_SCALE = 0.97;

interface DragState {
   pointerId: number;
   startY: number;
   moved: boolean;
}

/**
 * A floating status card that answers "where do I need to be, and how soon" in both views.
 * Resting above the bottom edge it leads with the countdown and the room; swiping up on it, or
 * clicking it, reveals the panel with the exact times, location, and teacher. Tapping the panel
 * opens the class, swiping it back down furls it. Everything is derived from cached weeks.
 */
export function NextUpCard({ weeks, timeOverride, isOpen, onChangeOpen, onSelectClass }: NextUpCardProps) {
   const now = useClock(isOpen ? 1000 : 5000, timeOverride);
   const entries = useMemo(() => collectNextUpEntries(weeks), [weeks]);
   const suggestion = useMemo(() => getNextUpSuggestion(entries, now), [entries, now]);
   const cardId = useId();
   const [dragProgress, setDragProgress] = useState<number | null>(null);
   const dragRef = useRef<DragState | null>(null);

   const startDrag = (event: PointerEvent<HTMLElement>) => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      dragRef.current = { pointerId: event.pointerId, startY: event.clientY, moved: false };
      event.currentTarget.setPointerCapture(event.pointerId);
   };

   const moveDrag = (event: PointerEvent<HTMLElement>) => {
      const drag = dragRef.current;
      if (drag?.pointerId !== event.pointerId) return;
      const delta = drag.startY - event.clientY; // Upward is positive: pull up to reveal, pull down to furl.
      if (!drag.moved && Math.abs(delta) <= TAP_SLOP_PX) return;
      drag.moved = true;
      setDragProgress(clamp((isOpen ? 1 : 0) + delta / REVEAL_DISTANCE_PX, 0, 1));
   };

   const endDrag = (event: PointerEvent<HTMLElement>, commit: boolean, tapAction: () => void) => {
      const drag = dragRef.current;
      if (drag?.pointerId !== event.pointerId) return;
      dragRef.current = null;
      try {
         event.currentTarget.releasePointerCapture(event.pointerId);
      } catch {
         // Capture may already be implicitly released on pointer up or cancel.
      }

      if (!commit) {
         setDragProgress(null);
         return;
      }

      if (!drag.moved) {
         // A press and release without movement is a tap. It activates on pointerup because the
         // browser can withhold the synthesized click entirely after a swipe gesture.
         tapAction();
         return;
      }

      if (dragProgress !== null) {
         const open = dragProgress >= OPEN_THRESHOLD;
         setDragProgress(null);
         if (open !== isOpen) onChangeOpen(open);
         return;
      }
      setDragProgress(null);
   };

   const toggleOpen = () => onChangeOpen(!isOpen);
   const handleToggleClick = (event: MouseEvent<HTMLButtonElement>) => {
      // Pointer taps already activated on pointerup; keyboard and assistive activation arrive as a
      // click without a pointer sequence, which reports detail 0.
      if (event.detail > 0) return;
      toggleOpen();
   };
   const handleOpenClassClick = (event: MouseEvent<HTMLButtonElement>) => {
      if (event.detail > 0) return;
      if (suggestion) onSelectClass(suggestion.target.schoolClass);
   };

   if (!suggestion) return null;

   const { phase, target, lead } = suggestion;
   const schoolClass = target.schoolClass;
   const room = schoolClass.room.trim();
   const location = schoolClass.location.trim();
   // The room is the primary destination; the campus location only stands in when no room is set.
   const destination = room || location || null;
   const detailsLocation = room && location && room.toLowerCase() !== location.toLowerCase() ? location : "";
   const dayLabel = getNextUpDayLabel(target, now);
   const details = [dayLabel, detailsLocation, schoolClass.teacher.trim()].filter(Boolean).join(DETAILS_SEPARATOR);
   const cardLead = `${phase === "now" ? "Ends" : "Starts"} ${timeLabel.format(phase === "now" ? target.endDate : target.startDate)}`;
   const title = getClassLabel(schoolClass);
   const nextUpStyle: CSSProperties | undefined =
      dragProgress === null
         ? undefined
         : {
              transform: `translateY(${((1 - dragProgress) * 100).toFixed(2)}%) translateY(${((1 - dragProgress) * 8).toFixed(2)}px) scale(${(CLOSED_SCALE + (1 - CLOSED_SCALE) * dragProgress).toFixed(4)})`,
           };
   const cardStyle: CSSProperties | undefined = dragProgress === null ? undefined : { opacity: dragProgress.toFixed(3) };
   // Phase and target identity drive the swap animation; the countdown text itself ticks without animating.
   const swapKey = `${phase}-${schoolClass.id}`;

   return (
      <div className="next-up" data-open={isOpen} data-dragging={dragProgress !== null} style={nextUpStyle}>
         <button
            className="next-up__handle"
            type="button"
            aria-expanded={isOpen}
            aria-controls={cardId}
            data-status={schoolClass.status}
            onClick={handleToggleClick}
            onPointerDown={startDrag}
            onPointerMove={moveDrag}
            onPointerUp={(event) => endDrag(event, true, toggleOpen)}
            onPointerCancel={(event) => endDrag(event, false, toggleOpen)}
            onLostPointerCapture={(event) => endDrag(event, false, toggleOpen)}
         >
            <span className="next-up__text" key={swapKey}>
               {phase === "now" ? <span className="next-up__dot" aria-hidden="true" /> : <i className="fa-regular fa-clock" aria-hidden="true" />}
               <span className="next-up__lead">{lead}</span>
               {destination ? (
                  <>
                     <span className="next-up__separator" aria-hidden="true">
                        ·
                     </span>
                     <span className="next-up__destination">{destination}</span>
                  </>
               ) : null}
            </span>
            <i className="fa-solid fa-chevron-down next-up__chevron" aria-hidden="true" />
         </button>

         <button
            className="next-up__card"
            type="button"
            id={cardId}
            data-open={isOpen}
            data-status={schoolClass.status}
            style={cardStyle}
            onClick={handleOpenClassClick}
            onPointerDown={startDrag}
            onPointerMove={moveDrag}
            onPointerUp={(event) => endDrag(event, true, () => onSelectClass(schoolClass))}
            onPointerCancel={(event) => endDrag(event, false, () => onSelectClass(schoolClass))}
            onLostPointerCapture={(event) => endDrag(event, false, () => onSelectClass(schoolClass))}
         >
            <span className="next-up__content" key={swapKey}>
               <span className="next-up__hero">
                  <span className="next-up__lead">{cardLead}</span>
                  {destination ? <span className="next-up__roomchip">{destination}</span> : null}
               </span>
               <span className="next-up__title">
                  <span className="next-up__title-text" title={title}>
                     {title}
                  </span>
                  <ClassStatusMarker status={schoolClass.status} />
               </span>
               <span className="next-up__details" title={details}>
                  {details}
               </span>
            </span>
         </button>
      </div>
   );
}
