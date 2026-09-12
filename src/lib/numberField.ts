import { clamp } from "./clamp";

export interface NumberFieldBounds {
   min: number;
   max: number;
   /** Distance between adjacent values. Defaults to 1; non-positive values fall back to 1. */
   step?: number;
   /** Force values onto the min + n * step grid. Defaults to true. */
   snap?: boolean;
}

interface ResolvedBounds {
   min: number;
   max: number;
   step: number;
   snap: boolean;
}

const EPSILON = 1e-9;

/** Remove arithmetic noise while preserving fractional bounds and unsnapped input. */
function roundValue(value: number) {
   return Number(value.toPrecision(15));
}

function resolveBounds(bounds: NumberFieldBounds): ResolvedBounds {
   const step = typeof bounds.step === "number" && Number.isFinite(bounds.step) && bounds.step > 0 ? bounds.step : 1;
   const snap = bounds.snap !== false;
   // When snapping, the reachable values are the lattice points; a max between two of them is not reachable.
   const max = snap ? bounds.min + Math.floor((bounds.max - bounds.min) / step + EPSILON) * step : bounds.max;
   return { min: bounds.min, max, step, snap };
}

/** Clamps into the field's range and snaps onto the step grid when the field requires it. */
export function normalizeNumberFieldValue(value: number, bounds: NumberFieldBounds) {
   const { min, max, step, snap } = resolveBounds(bounds);
   const clamped = clamp(value, min, max);
   if (!snap) {
      return clamped;
   }

   const steps = clamp(Math.round((clamped - min) / step), 0, Math.round((max - min) / step));
   return roundValue(min + steps * step);
}

/** Moves one step towards the bound, staying on the grid; returns the current value when already at the bound. */
export function stepNumberFieldValue(value: number, bounds: NumberFieldBounds, direction: 1 | -1) {
   const { min, max, step } = resolveBounds(bounds);
   const base = normalizeNumberFieldValue(value, bounds);
   return clamp(roundValue(base + direction * step), min, max);
}

export function canStepNumberFieldValue(value: number, bounds: NumberFieldBounds, direction: 1 | -1) {
   const { min, max } = resolveBounds(bounds);
   const base = normalizeNumberFieldValue(value, bounds);
   return direction > 0 ? base < max - EPSILON : base > min + EPSILON;
}

/** Parses manual input; accepts comma decimal separators and rejects anything that is not a plain number. */
export function parseNumberFieldInput(text: string) {
   const trimmed = text.trim().replace(",", ".");
   if (!/^[+-]?\d*\.?\d+$/.test(trimmed)) {
      return null;
   }

   const value = Number(trimmed);
   return Number.isFinite(value) ? value : null;
}
