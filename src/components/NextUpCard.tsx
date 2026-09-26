import { useId, useMemo, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { clamp } from "../lib/clamp";
import { CLASS_STATUS_ICONS, DETAILS_SEPARATOR, getClassLabel } from "../lib/classFormat";
import { timeLabel } from "../lib/date";
import { collectNextUpEntries, getNextUpDayLabel, getNextUpSuggestion, type NextUpEntry } from "../lib/nextUp";
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
const CLOSED_LIFT_PX = 26;
const CLOSED_SCALE = 0.97;

interface DragState {
   pointerId: number;
   startY: number;
   moved: boolean;
}

/**
 * A status strip above the timetable that answers "where do I need to be, and how soon" in both
 * views. Collapsed it is a centered pill leading with the countdown and the room; clicking or
 * pulling it down reveals the panel with the exact times, location, and teacher. Everything is
 * derived from already-cached weeks and never fetches.
 */
export function NextUpCard({ weeks, timeOverride, isOpen, onChangeOpen, onSelectClass }: NextUpCardProps) {
   const now = useClock(isOpen ? 1000 : 5000, timeOverride);
   const entries = useMemo(() => collectNextUpEntries(weeks), [weeks]);
   const suggestion = useMemo(() => getNextUpSuggestion(entries, now), [entries, now]);
   const cardId = useId();
   const [dragProgress, setDragProgress] = useState<number | null>(null);
   const dragRef = useRef<DragState | null>(null);
   const suppressClickRef = useRef(false);

   const handlePointerDown = (event: PointerEvent<HTMLButtonElement>) => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      dragRef.current = { pointerId: event.pointerId, startY: event.clientY, moved: false };
      event.currentTarget.setPointerCapture(event.pointerId);
   };

   const handlePointerMove = (event: PointerEvent<HTMLButtonElement>) => {
      const drag = dragRef.current;
      if (drag?.pointerId !== event.pointerId) return;
      const delta = event.clientY - drag.startY;
      if (!drag.moved && Math.abs(delta) <= TAP_SLOP_PX) return;
      drag.moved = true;
      // Pulling down reveals the panel; pulling up furls it again. Either way it tracks the finger.
      setDragProgress(clamp((isOpen ? 1 : 0) + delta / REVEAL_DISTANCE_PX, 0, 1));
   };

   const endDrag = (commit: boolean) => {
      const drag = dragRef.current;
      dragRef.current = null;
      if (!drag) return;
      if (drag.moved) suppressClickRef.current = true;
      if (commit && drag.moved && dragProgress !== null) {
         const open = dragProgress >= OPEN_THRESHOLD;
         setDragProgress(null);
         if (open !== isOpen) onChangeOpen(open);
         return;
      }
      setDragProgress(null);
   };

   const handleToggleClick = () => {
      if (suppressClickRef.current) {
         suppressClickRef.current = false;
         return;
      }
      onChangeOpen(!isOpen);
   };

   if (!suggestion) return null;

   const { phase, target, lead, progress, cancelled, then } = suggestion;
   const schoolClass = target.schoolClass;
   const room = schoolClass.room.trim();
   const location = schoolClass.location.trim();
   // The room is the primary destination; the campus location only stands in when no room is set.
   const destination = room || location || null;
   const detailsLocation = room && location && room.toLowerCase() !== location.toLowerCase() ? location : "";
   const dayLabel = getNextUpDayLabel(target, now);
   const details = [dayLabel, `${timeLabel.format(target.startDate)} – ${timeLabel.format(target.endDate)}`, detailsLocation, schoolClass.teacher.trim()]
      .filter(Boolean)
      .join(DETAILS_SEPARATOR);
   const title = getClassLabel(schoolClass);
   const cardStyle: CSSProperties | undefined =
      dragProgress === null
         ? undefined
         : {
              transform: `translateY(${((dragProgress - 1) * CLOSED_LIFT_PX).toFixed(2)}px) scale(${(CLOSED_SCALE + (1 - CLOSED_SCALE) * dragProgress).toFixed(4)})`,
              opacity: dragProgress.toFixed(3),
           };

   return (
      <div className="next-up" data-dragging={dragProgress !== null}>
         <button
            className="next-up__handle"
            type="button"
            aria-expanded={isOpen}
            aria-controls={cardId}
            data-live={phase === "now"}
            onClick={handleToggleClick}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={() => endDrag(true)}
            onPointerCancel={() => endDrag(false)}
         >
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
            <i className="fa-solid fa-chevron-down next-up__chevron" aria-hidden="true" />
         </button>

         <div className="next-up__card" id={cardId} role="region" aria-label="Next up" data-open={isOpen} style={cardStyle}>
            {phase === "now" ? (
               <span className="next-up__elapsed" aria-hidden="true">
                  <span style={{ width: `${progress * 100}%` }} />
               </span>
            ) : null}

            <button className="next-up__main" type="button" onClick={() => onSelectClass(schoolClass)}>
               <span className="next-up__hero">
                  <span className="next-up__lead" data-live={phase === "now"}>
                     {lead}
                  </span>
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
            </button>

            {cancelled ? <NextUpCancelledRow entry={cancelled} now={now} /> : null}
            {phase === "now" && then ? <NextUpThenRow entry={then} now={now} /> : null}
         </div>
      </div>
   );
}

function NextUpCancelledRow({ entry, now }: { entry: NextUpEntry; now: Date }) {
   const day = getNextUpDayLabel(entry, now) ?? "";
   const text = [`${day} ${timeLabel.format(entry.startDate)}`.trim(), getClassLabel(entry.schoolClass)].filter(Boolean).join(DETAILS_SEPARATOR);
   return (
      <div className="next-up__row next-up__row--cancelled">
         <i className={CLASS_STATUS_ICONS.cancelled} aria-hidden="true" />
         <span className="next-up__row-text" title={`${text} was cancelled`}>
            {text} was cancelled
         </span>
      </div>
   );
}

function NextUpThenRow({ entry, now }: { entry: NextUpEntry; now: Date }) {
   const day = getNextUpDayLabel(entry, now) ?? "";
   const room = entry.schoolClass.room.trim() || entry.schoolClass.location.trim();
   const text = [`Then ${day} ${timeLabel.format(entry.startDate)}`.replace(/\s+/g, " ").trim(), getClassLabel(entry.schoolClass), room]
      .filter(Boolean)
      .join(DETAILS_SEPARATOR);
   return (
      <div className="next-up__row next-up__row--then">
         <i className="fa-solid fa-angles-right" aria-hidden="true" />
         <span className="next-up__row-text" title={text}>
            {text}
         </span>
      </div>
   );
}
