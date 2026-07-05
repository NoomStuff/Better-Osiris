import { formatShortcut, type KeyboardShortcut } from "../hooks/useKeyboardShortcuts";

export type AppShortcutId =
   "previousWeek" | "nextWeek" | "currentWeek" | "agendaView" | "gridView" | "settings" | "previousToolbarAction" | "nextToolbarAction";

type AppShortcutDefinition = Pick<KeyboardShortcut, "ctrlKey" | "key" | "shiftKey">;

export const APP_SHORTCUTS: Record<AppShortcutId, AppShortcutDefinition> = {
   previousWeek: { key: "ArrowLeft" },
   nextWeek: { key: "ArrowRight" },
   currentWeek: { key: "r" },
   agendaView: { key: "a" },
   gridView: { key: "g" },
   settings: { key: "i" },
   previousToolbarAction: { ctrlKey: true, key: "ArrowLeft" },
   nextToolbarAction: { ctrlKey: true, key: "ArrowRight" },
};

export const APP_SHORTCUT_LABELS: Record<AppShortcutId, string> = {
   previousWeek: formatShortcut(APP_SHORTCUTS.previousWeek),
   nextWeek: formatShortcut(APP_SHORTCUTS.nextWeek),
   currentWeek: "Space / R / 0",
   agendaView: "A",
   gridView: "G",
   settings: "I",
   previousToolbarAction: formatShortcut(APP_SHORTCUTS.previousToolbarAction),
   nextToolbarAction: formatShortcut(APP_SHORTCUTS.nextToolbarAction),
};
