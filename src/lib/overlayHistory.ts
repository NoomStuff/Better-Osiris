/* Shared history bookkeeping for OverlayPanel: every panel pushes one history entry when it
   mounts and consumes it when it closes itself, so the browser or hardware back closes the
   topmost overlay. The marker in each entry's history state tells a user back (the current
   entry is no longer ours) apart from our own programmatic consume (an entry above ours was
   popped, so the current entry still belongs to us). */

const OVERLAY_HISTORY_KEY = "betterOsirisOverlay";
const overlayStack: string[] = [];
const overlayHistoryEntries = new Map<string, { alive: boolean }>();
const pendingOverlayHistoryConsumes = new Map<string, number>();

export function pushOverlayId(id: string) {
   overlayStack.push(id);
}

export function removeOverlayId(id: string) {
   const stackIndex = overlayStack.lastIndexOf(id);
   if (stackIndex >= 0) {
      overlayStack.splice(stackIndex, 1);
   }
}

export function getTopmostOverlayId() {
   return overlayStack.at(-1) ?? null;
}

function getTopmostAliveOverlayId() {
   for (let index = overlayStack.length - 1; index >= 0; index -= 1) {
      const id = overlayStack[index];
      if (id !== undefined && overlayHistoryEntries.get(id)?.alive) {
         return id;
      }
   }
   return null;
}

/** Claims this panel's history entry, reusing the still-current one after a synchronous
    StrictMode remount instead of stacking a second entry. */
export function beginOverlayHistoryEntry(id: string) {
   const pendingConsume = pendingOverlayHistoryConsumes.get(id);
   if (pendingConsume !== undefined) {
      window.clearTimeout(pendingConsume);
      pendingOverlayHistoryConsumes.delete(id);
   }

   if ((history.state as Record<string, unknown> | null)?.[OVERLAY_HISTORY_KEY] !== id) {
      history.pushState({ [OVERLAY_HISTORY_KEY]: id }, "");
   }
   overlayHistoryEntries.set(id, { alive: true });
}

/** Marks the entry as popped so the pending unmount does not consume it a second time. */
export function abandonOverlayHistoryEntry(id: string) {
   const entry = overlayHistoryEntries.get(id);
   if (entry) {
      entry.alive = false;
   }
}

/** Releases the panel's claim; a still-alive entry is given back so the next back press does
    not spend it. Deferred by a tick so a synchronous remount can cancel the consume. */
export function endOverlayHistoryEntry(id: string) {
   const entry = overlayHistoryEntries.get(id);
   overlayHistoryEntries.delete(id);
   if (!entry?.alive) {
      return;
   }

   const timer = window.setTimeout(() => {
      pendingOverlayHistoryConsumes.delete(id);
      if ((history.state as Record<string, unknown> | null)?.[OVERLAY_HISTORY_KEY] === id) {
         history.back();
      }
   }, 0);
   pendingOverlayHistoryConsumes.set(id, timer);
}

/** Whether this popstate popped the panel's own entry and it should close. */
export function shouldOverlayCloseOnPopState(id: string, event: PopStateEvent) {
   const state = event.state as Record<string, unknown> | null;
   if (state?.[OVERLAY_HISTORY_KEY] === id) {
      return false;
   }
   return getTopmostAliveOverlayId() === id;
}

let hasDiscardedStaleHistoryEntry = false;

/**
 * A reload with an overlay open leaves the dead marker entry as the current one, which would
 * swallow the first back press. Handing it back at startup keeps back working from the first
 * press; running once per load keeps a StrictMode double call from leaving the app.
 */
export function discardStaleOverlayHistoryEntry() {
   if (hasDiscardedStaleHistoryEntry) {
      return;
   }
   hasDiscardedStaleHistoryEntry = true;
   if ((history.state as Record<string, unknown> | null)?.[OVERLAY_HISTORY_KEY] !== undefined) {
      history.back();
   }
}
