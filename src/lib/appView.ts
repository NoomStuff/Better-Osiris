import type { GridZoom, ViewMode } from "../types/roster";

export const GRID_ZOOM_ORDER = ["hour", "half", "quarter"] as const satisfies readonly GridZoom[];

export function getAdjacentGridZoom(currentZoom: GridZoom, direction: -1 | 1) {
   const currentIndex = GRID_ZOOM_ORDER.indexOf(currentZoom);
   const nextIndex = Math.min(Math.max(currentIndex + direction, 0), GRID_ZOOM_ORDER.length - 1);
   return GRID_ZOOM_ORDER[nextIndex] ?? currentZoom;
}

export function getToolbarActionActivationId(viewMode: ViewMode, actionNumber: number) {
   if (viewMode === "agenda") {
      if (actionNumber === 1) return "agenda-expand";
      if (actionNumber === 2) return "agenda-close";
      return undefined;
   }

   const zoom = GRID_ZOOM_ORDER[actionNumber - 1];
   return zoom ? `zoom-${zoom}` : undefined;
}
