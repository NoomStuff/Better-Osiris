import { useId, type CSSProperties } from "react";
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
   const [start, end] = value;
   const toPercent = (point: number) => `${((point - min) / (max - min)) * 100}%`;
   const style: RangeSliderStyle = { "--slider-start": toPercent(start), "--slider-end": toPercent(end) };

   return (
      <div className="slider slider--range" role="group" aria-labelledby={labelId} style={style}>
         <div className="slider__header" id={labelId}>
            <span>{label}</span>
            <strong>
               {formatValue(start)} <span aria-hidden="true">–</span> {formatValue(end)}
            </strong>
         </div>
         <div className="slider__control">
            <span className="slider__track" aria-hidden="true" />
            <span className="slider__fill" aria-hidden="true" />
            <input
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
