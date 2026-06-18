import { useEffect } from "react";
import { triggerShortcutActivation } from "./useShortcutActivation";

export interface KeyboardShortcut {
   id: string;
   key: string;
   altKey?: boolean;
   ctrlKey?: boolean;
   metaKey?: boolean;
   shiftKey?: boolean;
   disabled?: boolean;
   preventDefault?: boolean;
   activationTargetId?: string | undefined;
   onPress: () => void;
}

export function useKeyboardShortcuts(shortcuts: readonly KeyboardShortcut[], enabled = true) {
   useEffect(() => {
      if (!enabled) {
         return;
      }

      const handleKeyDown = (event: KeyboardEvent) => {
         if (event.repeat || isEditableTarget(event.target)) {
            return;
         }

         const shortcut = shortcuts.find((candidate) => !candidate.disabled && matchesShortcut(event, candidate));
         if (!shortcut) {
            return;
         }

         if (shortcut.preventDefault !== false) {
            event.preventDefault();
         }

         if (shortcut.activationTargetId) {
            triggerShortcutActivation(shortcut.activationTargetId);
         }

         shortcut.onPress();
      };

      window.addEventListener("keydown", handleKeyDown);

      return () => {
         window.removeEventListener("keydown", handleKeyDown);
      };
   }, [enabled, shortcuts]);
}

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

function matchesShortcut(event: KeyboardEvent, shortcut: KeyboardShortcut) {
   return (
      event.key.toLowerCase() === shortcut.key.toLowerCase() &&
      event.altKey === Boolean(shortcut.altKey) &&
      event.ctrlKey === Boolean(shortcut.ctrlKey) &&
      event.metaKey === Boolean(shortcut.metaKey) &&
      event.shiftKey === Boolean(shortcut.shiftKey)
   );
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

function isEditableTarget(target: EventTarget | null) {
   if (!(target instanceof HTMLElement)) {
      return false;
   }

   if (target.isContentEditable) {
      return true;
   }

   return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement;
}
