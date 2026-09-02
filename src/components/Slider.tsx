import { useId, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import "./Slider.css";

interface SliderProps {
   label: string;
   min: number;
   max: number;
   step: number;
   value: number;
   formatValue?: (value: number) => string;
   onChange: (value: number) => void;
}

type SliderStyle = CSSProperties & {
   "--slider-end": string;
};

// Pointer travel before a press counts as a drag. Clicks jitter by a pixel or two, and the
// drag state suspends the movement transitions, so the threshold keeps their glide intact.
const DRAG_SLOP_PX = 4;

export function Slider({ label, min, max, step, value, formatValue = String, onChange }: SliderProps) {
   const labelId = useId();
   // The input drags natively; flagging the drag once the pointer passes the slop suspends
   // the movement transitions so the thumb follows the pointer instead of animating behind
   // it, while a still click keeps its glide (see Slider.css).
   const pressRef = useRef<{ pointerId: number; startX: number } | null>(null);
   const [isDragging, setIsDragging] = useState(false);
   const toPercent = (point: number) => `${((point - min) / (max - min)) * 100}%`;
   const style: SliderStyle = { "--slider-end": toPercent(value) };

   const onPointerDown = (event: ReactPointerEvent<HTMLInputElement>) => {
      if (!event.isPrimary || event.button !== 0) {
         return;
      }
      pressRef.current = { pointerId: event.pointerId, startX: event.clientX };
   };

   const onPointerMove = (event: ReactPointerEvent<HTMLInputElement>) => {
      const press = pressRef.current?.pointerId === event.pointerId ? pressRef.current : null;
      if (press && Math.abs(event.clientX - press.startX) > DRAG_SLOP_PX) {
         setIsDragging(true);
      }
   };

   const onPointerEnd = () => {
      pressRef.current = null;
      setIsDragging(false);
   };

   return (
      <div className="slider" data-dragging={isDragging || undefined} role="group" aria-labelledby={labelId} style={style}>
         <div className="slider__header" id={labelId}>
            <span>{label}</span>
            <strong>{formatValue(value)}</strong>
         </div>
         <div className="slider__control">
            <span className="slider__track" aria-hidden="true" />
            <span className="slider__fill" aria-hidden="true" />
            <input
               className="slider__input"
               type="range"
               min={min}
               max={max}
               step={step}
               value={value}
               aria-label={label}
               aria-valuetext={formatValue(value)}
               onPointerDown={onPointerDown}
               onPointerMove={onPointerMove}
               onPointerUp={onPointerEnd}
               onPointerCancel={onPointerEnd}
               onLostPointerCapture={onPointerEnd}
               onChange={(event) => onChange(Number(event.currentTarget.value))}
            />
            <span className="slider__thumb" aria-hidden="true" />
         </div>
      </div>
   );
}
