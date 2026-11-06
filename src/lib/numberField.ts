import { clamp } from "./clamp";

/** Inclusive integer range of a number field. */
export interface NumberFieldBounds {
   min: number;
   max: number;
}

export function normalizeNumberFieldValue(value: number, { min, max }: NumberFieldBounds) {
   return clamp(Math.round(value), min, max);
}

/** Moves one towards the bound; returns the bound when already there. */
export function stepNumberFieldValue(value: number, bounds: NumberFieldBounds, direction: 1 | -1) {
   return normalizeNumberFieldValue(normalizeNumberFieldValue(value, bounds) + direction, bounds);
}

export function canStepNumberFieldValue(value: number, bounds: NumberFieldBounds, direction: 1 | -1) {
   const base = normalizeNumberFieldValue(value, bounds);
   return direction > 0 ? base < bounds.max : base > bounds.min;
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
