import { useId, useMemo, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { clamp } from "../lib/clamp";
import { CLASS_STATUS_ICONS, DETAILS_SEPARATOR, getClassLabel, getClassLocationLabel } from "../lib/classFormat";
import { timeLabel } from "../lib/date";
import { collectNextUpEntries, getNextUpDayLabel, getNextUpSuggestion, getNextUpSummary, type NextUpEntry } from "../lib/nextUp";
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
 * The glanceable answer to "what do I need to be where, and how soon". Collapsed it is a
 * centered countdown pill; clicking or pulling it down reveals the floating card. The card
 * derives everything from already-cached weeks and never fetches.
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
      // Pulling down reveals the card; pulling up furls it again. Either way it tracks the finger.
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

   const { phase, target, progress, cancelled, then } = suggestion;
   const summary = getNextUpSummary(suggestion, now);
   const title = getClassLabel(target.schoolClass);
   const details = [
      `${timeLabel.format(target.startDate)} – ${timeLabel.format(target.endDate)}`,
      getClassLocationLabel(target.schoolClass),
      target.schoolClass.teacher.trim(),
   ]
      .filter(Boolean)
      .join(DETAILS_SEPARATOR);
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
            <span className="next-up__summary">{summary}</span>
            <i className="fa-solid fa-chevron-down next-up__chevron" aria-hidden="true" />
         </button>

         <div className="next-up__card" id={cardId} role="region" aria-label="Next up" data-open={isOpen} style={cardStyle}>
            <button className="next-up__main" type="button" onClick={() => onSelectClass(target.schoolClass)}>
               <span className="next-up__eyebrow" data-live={phase === "now"}>
                  {phase === "now" ? <span className="next-up__dot" aria-hidden="true" /> : <i className="fa-regular fa-clock" aria-hidden="true" />}
                  {summary}
               </span>
               <span className="next-up__title">
                  <span className="next-up__title-text" title={title}>
                     {title}
                  </span>
                  <ClassStatusMarker status={target.schoolClass.status} />
               </span>
               <span className="next-up__details" title={details}>
                  {details}
               </span>
               {phase === "now" ? (
                  <span className="next-up__progress" aria-hidden="true">
                     <span style={{ width: `${progress * 100}%` }} />
                  </span>
               ) : null}
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
   const text = [
      `Then ${day} ${timeLabel.format(entry.startDate)}`.replace(/\s+/g, " ").trim(),
      getClassLabel(entry.schoolClass),
      getClassLocationLabel(entry.schoolClass),
   ]
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
