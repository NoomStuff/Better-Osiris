/** Preserve server pacing, while bounding malformed or unreasonable external values. */
export function readRetryAfter(value: string | null, now = Date.now()): number {
   if (!value) return 0;
   const trimmed = value.trim();
   const delay = /^\d+$/.test(trimmed) ? Number(trimmed) * 1000 : Date.parse(trimmed) - now;
   return Number.isFinite(delay) ? Math.min(Math.max(delay, 0), 24 * 60 * 60_000) : 0;
}
