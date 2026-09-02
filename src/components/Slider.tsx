import { useId, type CSSProperties } from "react";
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

export function Slider({ label, min, max, step, value, formatValue = String, onChange }: SliderProps) {
   const labelId = useId();
   const toPercent = (point: number) => `${((point - min) / (max - min)) * 100}%`;
   const style: SliderStyle = { "--slider-end": toPercent(value) };

   return (
      <div className="slider" role="group" aria-labelledby={labelId} style={style}>
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
               onChange={(event) => onChange(Number(event.currentTarget.value))}
            />
            <span className="slider__thumb" aria-hidden="true" />
         </div>
      </div>
   );
}
