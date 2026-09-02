import { useId, type CSSProperties } from "react";
import "./RangeSlider.css";

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
   "--range-start": string;
   "--range-end": string;
};

export function RangeSlider({ label, min, max, step, value, startLabel, endLabel, formatValue = String, onChange }: RangeSliderProps) {
   const labelId = useId();
   const [start, end] = value;
   const toPercent = (point: number) => `${((point - min) / (max - min)) * 100}%`;
   const style: RangeSliderStyle = { "--range-start": toPercent(start), "--range-end": toPercent(end) };

   return (
      <div className="range-slider" role="group" aria-labelledby={labelId} style={style}>
         <div className="range-slider__values" id={labelId}>
            <span>{label}</span>
            <strong>
               {formatValue(start)} <span aria-hidden="true">–</span> {formatValue(end)}
            </strong>
         </div>
         <div className="range-slider__control">
            <span className="range-slider__track" aria-hidden="true" />
            <span className="range-slider__selection" aria-hidden="true" />
            <input
               className="range-slider__input range-slider__input--start"
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
               className="range-slider__input range-slider__input--end"
               type="range"
               min={min}
               max={max}
               step={step}
               value={end}
               aria-label={endLabel}
               aria-valuetext={formatValue(end)}
               onChange={(event) => onChange([start, Math.max(Number(event.currentTarget.value), start + step)])}
            />
            <span className="range-slider__grip range-slider__grip--start" aria-hidden="true" />
            <span className="range-slider__grip range-slider__grip--end" aria-hidden="true" />
         </div>
      </div>
   );
}
