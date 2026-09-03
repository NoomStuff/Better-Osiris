import { APP_SHORTCUTS } from "../lib/appShortcuts";
import { getAdjacentGridZoom, getToolbarActionActivationId, GRID_ZOOM_ORDER } from "../lib/appView";
import { ROSTER_BATCH_SIZE } from "../lib/weekPolicy";
import { MAX_WEEK_OFFSET, MIN_WEEK_OFFSET } from "../../shared/weeks";
import type { GridZoom, ViewMode } from "../types/weeks";
import { useKeyboardShortcuts, type KeyboardShortcut } from "./useKeyboardShortcuts";

const FUTURE_WEEK_KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;

interface AppKeyboardShortcutOptions {
   enabled: boolean;
   viewMode: ViewMode;
   gridZoom: GridZoom;
   weekOffset: number;
   canGoPrevious: boolean;
   canGoNext: boolean;
   isWeekNavigable: (offset: number) => boolean;
   goPreviousWeek: () => void;
   goNextWeek: () => void;
   goCurrentWeek: () => void;
   changeViewMode: (viewMode: ViewMode) => void;
   changeGridZoom: (zoom: GridZoom) => void;
   expandAllAgenda: () => void;
   collapseAllAgenda: () => void;
   openSettings: () => void;
   goToWeek: (offset: number, transitionDirection?: "previous" | "next") => void;
}

export function useAppKeyboardShortcuts(options: AppKeyboardShortcutOptions) {
   const previousBatchOffset = Math.max(MIN_WEEK_OFFSET, options.weekOffset - ROSTER_BATCH_SIZE);
   const nextBatchOffset = Math.min(MAX_WEEK_OFFSET, options.weekOffset + ROSTER_BATCH_SIZE);
   const previousToolbarAction =
      options.viewMode === "agenda" ? options.expandAllAgenda : () => options.changeGridZoom(getAdjacentGridZoom(options.gridZoom, -1));
   const nextToolbarAction = options.viewMode === "agenda" ? options.collapseAllAgenda : () => options.changeGridZoom(getAdjacentGridZoom(options.gridZoom, 1));
   const shortcuts: KeyboardShortcut[] = [
      {
         id: "previous-week",
         ...APP_SHORTCUTS.previousWeek,
         activationTargetId: "previous-week",
         disabled: !options.canGoPrevious,
         repeat: true,
         onPress: options.goPreviousWeek,
      },
      {
         id: "next-week",
         ...APP_SHORTCUTS.nextWeek,
         activationTargetId: "next-week",
         disabled: !options.canGoNext,
         repeat: true,
         onPress: options.goNextWeek,
      },
      {
         id: "previous-week-batch",
         key: "ArrowLeft",
         shiftKey: true,
         activationTargetId: "previous-week",
         disabled: previousBatchOffset === options.weekOffset || !options.isWeekNavigable(previousBatchOffset),
         repeat: true,
         onPress: () => options.goToWeek(previousBatchOffset, "previous"),
      },
      {
         id: "next-week-batch",
         key: "ArrowRight",
         shiftKey: true,
         activationTargetId: "next-week",
         disabled: nextBatchOffset === options.weekOffset || !options.isWeekNavigable(nextBatchOffset),
         repeat: true,
         onPress: () => options.goToWeek(nextBatchOffset, "next"),
      },
      {
         id: "current-week-r",
         ...APP_SHORTCUTS.currentWeek,
         activationTargetId: "current-week",
         onPress: options.goCurrentWeek,
      },
      { id: "current-week-0", key: "0", activationTargetId: "current-week", onPress: options.goCurrentWeek },
      { id: "current-week-space", key: " ", activationTargetId: "current-week", onPress: options.goCurrentWeek },
      {
         id: "agenda-view",
         ...APP_SHORTCUTS.agendaView,
         activationTargetId: "agenda-view",
         onPress: () => options.changeViewMode("agenda"),
      },
      {
         id: "grid-view",
         ...APP_SHORTCUTS.gridView,
         activationTargetId: "grid-view",
         onPress: () => options.changeViewMode("grid"),
      },
      { id: "open-settings", ...APP_SHORTCUTS.settings, activationTargetId: "settings", onPress: options.openSettings },
      {
         id: "previous-toolbar-action",
         ...APP_SHORTCUTS.previousToolbarAction,
         activationTargetId: options.viewMode === "agenda" ? "agenda-expand" : `zoom-${getAdjacentGridZoom(options.gridZoom, -1)}`,
         onPress: previousToolbarAction,
      },
      {
         id: "next-toolbar-action",
         ...APP_SHORTCUTS.nextToolbarAction,
         activationTargetId: options.viewMode === "agenda" ? "agenda-close" : `zoom-${getAdjacentGridZoom(options.gridZoom, 1)}`,
         onPress: nextToolbarAction,
      },
      ...FUTURE_WEEK_KEYS.map<KeyboardShortcut>((key) => ({
         id: `future-week-${key}`,
         key,
         disabled: !options.isWeekNavigable(Number(key)),
         onPress: () => options.goToWeek(Number(key)),
      })),
      ...FUTURE_WEEK_KEYS.map<KeyboardShortcut>((key) => ({
         id: `toolbar-action-${key}`,
         ctrlKey: true,
         key,
         activationTargetId: getToolbarActionActivationId(options.viewMode, Number(key)),
         onPress: () => {
            if (options.viewMode === "agenda") {
               if (key === "1") options.expandAllAgenda();
               if (key === "2") options.collapseAllAgenda();
               return;
            }

            const zoom = GRID_ZOOM_ORDER[Number(key) - 1];
            if (zoom) options.changeGridZoom(zoom);
         },
      })),
   ];

   useKeyboardShortcuts(shortcuts, options.enabled);
}
