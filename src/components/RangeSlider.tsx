import { useId, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import "./Slider.css";

interface RangeSliderProps {
   label: string;
   min: number;
   max: number;
   step: number;
   value: readonly [number, number];
   startLabel: string;
   endLabel: string;
   formatValue?: (value: number) => string;
   onChange: (value: readonly [number, number]) => void;
}

type RangeSliderStyle = CSSProperties & {
   "--slider-start": string;
   "--slider-end": string;
};

export function RangeSlider({ label, min, max, step, value, startLabel, endLabel, formatValue = String, onChange }: RangeSliderProps) {
   const labelId = useId();
   const controlRef = useRef<HTMLDivElement | null>(null);
   const startInputRef = useRef<HTMLInputElement | null>(null);
   const endInputRef = useRef<HTMLInputElement | null>(null);
   const dragRef = useRef<{ pointerId: number; side: "start" | "end" } | null>(null);
   // Set from the first drag move, not the press, so a track click keeps its glide while the
   // drag that follows tracks the pointer without animation lag (see Slider.css).
   const [isDragging, setIsDragging] = useState(false);
   const [start, end] = value;
   const toPercent = (point: number) => `${((point - min) / (max - min)) * 100}%`;
   const style: RangeSliderStyle = { "--slider-start": toPercent(start), "--slider-end": toPercent(end) };

   // The range inputs pass pointer events through, so the control sees every press: it snaps
   // the nearest thumb to the cursor and keeps moving that same thumb until release. Moving a
   // thumb keeps the one-step gap between the two.
   const valueAt = (clientX: number) => {
      const control = controlRef.current;
      if (!control) {
         return null;
      }
      const rect = control.getBoundingClientRect();
      const ratio = Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1);
      return Math.min(Math.max(min + Math.round((ratio * (max - min)) / step) * step, min), max);
   };

   const moveThumb = (side: "start" | "end", target: number) => {
      if (side === "start") {
         onChange([Math.min(target, end - step), end]);
      } else {
         onChange([start, Math.max(target, start + step)]);
      }
   };

   const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!event.isPrimary || event.button !== 0) {
         return;
      }
      const target = valueAt(event.clientX);
      if (target === null) {
         return;
      }
      const side = target - start <= end - target ? "start" : "end";
      dragRef.current = { pointerId: event.pointerId, side };
      event.currentTarget.setPointerCapture(event.pointerId);
      event.preventDefault();
      (side === "start" ? startInputRef : endInputRef).current?.focus({ preventScroll: true });
      moveThumb(side, target);
   };

   const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current?.pointerId === event.pointerId ? dragRef.current : null;
      if (!drag) {
         return;
      }
      setIsDragging(true);
      const target = valueAt(event.clientX);
      if (target !== null) {
         moveThumb(drag.side, target);
      }
   };

   const onPointerEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
      if (dragRef.current?.pointerId !== event.pointerId) {
         return;
      }
      dragRef.current = null;
      setIsDragging(false);
   };

   return (
      <div className="slider slider--range" data-dragging={isDragging || undefined} role="group" aria-labelledby={labelId} style={style}>
         <div className="slider__header" id={labelId}>
            <span>{label}</span>
            <strong>
               {formatValue(start)} <span aria-hidden="true">–</span> {formatValue(end)}
            </strong>
         </div>
         <div
            ref={controlRef}
            className="slider__control"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerEnd}
            onPointerCancel={onPointerEnd}
            onLostPointerCapture={onPointerEnd}
         >
            <span className="slider__track" aria-hidden="true" />
            <span className="slider__fill" aria-hidden="true" />
            <input
               ref={startInputRef}
               className="slider__input slider__input--start"
               type="range"
               min={min}
               max={max}
               step={step}
               value={start}
               aria-label={startLabel}
               aria-valuetext={formatValue(start)}
               onChange={(event) => onChange([Math.min(Number(event.currentTarget.value), end - step), end])}
            />
            <input
               ref={endInputRef}
               className="slider__input slider__input--end"
               type="range"
               min={min}
               max={max}
               step={step}
               value={end}
               aria-label={endLabel}
               aria-valuetext={formatValue(end)}
               onChange={(event) => onChange([start, Math.max(Number(event.currentTarget.value), start + step)])}
            />
            <span className="slider__thumb slider__thumb--start" aria-hidden="true" />
            <span className="slider__thumb slider__thumb--end" aria-hidden="true" />
         </div>
      </div>
   );
}
