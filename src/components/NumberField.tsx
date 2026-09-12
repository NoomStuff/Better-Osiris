import { useEffect, useRef, useState } from "react";
import { canStepNumberFieldValue, normalizeNumberFieldValue, parseNumberFieldInput, stepNumberFieldValue, type NumberFieldBounds } from "../lib/numberField";
import "./NumberField.css";
export interface NumberFieldProps extends NumberFieldBounds {
   label: string;
   value: number;
   unit?: string;
   disabled?: boolean;
   onChange: (value: number) => void;
}
export function NumberField({ label, value, unit, disabled = false, onChange, ...bounds }: NumberFieldProps) {
   const [motion, setMotion] = useState({ value, direction: "up" });
   if (motion.value !== value) {
      setMotion({ value, direction: value < motion.value ? "down" : "up" });
   }
   const [draft, setDraft] = useState<string | null>(null);
   const input = useRef<HTMLInputElement>(null);
   const button = useRef<HTMLButtonElement>(null);
   const restore = useRef(false);
   const editing = draft !== null;
   useEffect(() => {
      if (editing) {
         input.current?.focus();
         input.current?.select();
      } else if (restore.current) {
         restore.current = false;
         button.current?.focus();
      }
   }, [editing]);
   const finish = (commit: boolean, focus = false) => {
      const parsed = parseNumberFieldInput(draft ?? "");
      if (commit && !disabled && parsed !== null) onChange(normalizeNumberFieldValue(parsed, bounds));
      restore.current = focus;
      setDraft(null);
   };
   const move = (direction: 1 | -1) => {
      if (disabled) return;
      const next = stepNumberFieldValue(parseNumberFieldInput(draft ?? "") ?? value, bounds, direction);
      if (editing) setDraft(String(next));
      else onChange(next);
   };
   return (
      <div className="number-field" role="group" aria-label={label}>
         <button
            type="button"
            className="number-field__step"
            aria-label={`Decrease ${label}`}
            disabled={disabled || !canStepNumberFieldValue(value, bounds, -1)}
            onClick={() => move(-1)}
         >
            −
         </button>
         {editing ? (
            <input
               ref={input}
               className="number-field__input"
               type="text"
               inputMode="decimal"
               aria-label={label}
               disabled={disabled}
               value={draft}
               onChange={(event) => setDraft(event.target.value)}
               onBlur={() => finish(true)}
               onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === "Escape") {
                     event.preventDefault();
                     event.stopPropagation();
                     finish(event.key === "Enter", true);
                  } else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
                     event.preventDefault();
                     move(event.key === "ArrowUp" ? 1 : -1);
                  }
               }}
            />
         ) : (
            <button
               ref={button}
               type="button"
               className="number-field__value"
               disabled={disabled}
               aria-label={`${label}: ${value}${unit ? ` ${unit}` : ""}`}
               onClick={() => setDraft(String(value))}
            >
               <span key={value} className="number-field__number" data-direction={motion.direction}>
                  {value}
               </span>
               {unit && <span className="number-field__unit">{unit}</span>}
            </button>
         )}
         <button
            type="button"
            className="number-field__step"
            aria-label={`Increase ${label}`}
            disabled={disabled || !canStepNumberFieldValue(value, bounds, 1)}
            onClick={() => move(1)}
         >
            +
         </button>
      </div>
   );
}
