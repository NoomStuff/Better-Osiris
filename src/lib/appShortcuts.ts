import type { KeyboardShortcut } from "../hooks/useKeyboardShortcuts";

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
   currentWeek: "R / 0",
   agendaView: "A",
   gridView: "G",
   settings: "I",
   previousToolbarAction: formatShortcut(APP_SHORTCUTS.previousToolbarAction),
   nextToolbarAction: formatShortcut(APP_SHORTCUTS.nextToolbarAction),
};

export function formatShortcut(shortcut: Pick<KeyboardShortcut, "altKey" | "ctrlKey" | "key" | "metaKey" | "shiftKey">) {
   const parts = [
      shortcut.ctrlKey ? "Ctrl" : null,
      shortcut.altKey ? "Alt" : null,
      shortcut.shiftKey ? "Shift" : null,
      shortcut.metaKey ? "Meta" : null,
      formatKey(shortcut.key),
   ].filter((part): part is string => part !== null);

   return parts.join(" + ");
}

function formatKey(key: string) {
   switch (key) {
      case "ArrowLeft":
         return "Left";
      case "ArrowRight":
         return "Right";
      case "ArrowUp":
         return "Up";
      case "ArrowDown":
         return "Down";
      case " ":
         return "Space";
      default:
         return key.length === 1 ? key.toUpperCase() : key;
   }
}
