import { useMemo } from "react";
import { APP_SHORTCUTS } from "../lib/appShortcuts";
import { getAdjacentGridZoom, getToolbarActionActivationId } from "../lib/appView";
import type { GridZoom, ViewMode } from "../types/roster";
import { useKeyboardShortcuts, type KeyboardShortcut } from "./useKeyboardShortcuts";

const FUTURE_WEEK_KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;

interface AppKeyboardShortcutOptions {
   enabled: boolean;
   viewMode: ViewMode;
   gridZoom: GridZoom;
   canGoPrevious: boolean;
   canGoNext: boolean;
   isWeekNavigable: (offset: number) => boolean;
   goPreviousWeek: () => void;
   goNextWeek: () => void;
   goCurrentWeek: () => void;
   changeViewMode: (viewMode: ViewMode) => void;
   openSettings: () => void;
   moveToolbarAction: (direction: -1 | 1) => void;
   selectToolbarAction: (actionNumber: number) => void;
   goToWeek: (offset: number) => void;
}

export function useAppKeyboardShortcuts(options: AppKeyboardShortcutOptions) {
   const shortcuts = useMemo<KeyboardShortcut[]>(
      () => [
         {
            id: "previous-week",
            ...APP_SHORTCUTS.previousWeek,
            activationTargetId: "previous-week",
            disabled: !options.canGoPrevious,
            onPress: options.goPreviousWeek,
         },
         {
            id: "next-week",
            ...APP_SHORTCUTS.nextWeek,
            activationTargetId: "next-week",
            disabled: !options.canGoNext,
            onPress: options.goNextWeek,
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
            onPress: () => options.moveToolbarAction(-1),
         },
         {
            id: "next-toolbar-action",
            ...APP_SHORTCUTS.nextToolbarAction,
            activationTargetId: options.viewMode === "agenda" ? "agenda-close" : `zoom-${getAdjacentGridZoom(options.gridZoom, 1)}`,
            onPress: () => options.moveToolbarAction(1),
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
            onPress: () => options.selectToolbarAction(Number(key)),
         })),
      ],
      [options]
   );

   useKeyboardShortcuts(shortcuts, options.enabled);
}
