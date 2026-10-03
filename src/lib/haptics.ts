/**
 * A short tactile tick for gesture feedback: swipe commits, panel dismissals, and card
 * unfurls. Vibration is only widely available on Android browsers; everywhere else this
 * is a silent no-op, so call sites never need to check support themselves.
 */
export function haptic(durationMs = 10) {
   if (typeof navigator === "undefined" || !("vibrate" in navigator)) {
      return;
   }

   try {
      navigator.vibrate(durationMs);
   } catch {
      // Some contexts (permission policies, embedded frames) reject vibration outright; feedback is optional.
   }
}
