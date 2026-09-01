import { useEffect, useLayoutEffect, useRef } from "react";
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
   // The listener reads the latest shortcuts when a key lands, so it only has to be attached once.
   const shortcutsRef = useRef(shortcuts);

   useLayoutEffect(() => {
      shortcutsRef.current = shortcuts;
   });

   useEffect(() => {
      if (!enabled) {
         return;
      }

      // Chromium re-evaluates :focus-visible on keyboard input, so after any keypress a
      // button that was merely clicked would suddenly paint a focus ring. Track
      // pointer-focused elements and release them when a shortcut is handled; elements
      // focused through keyboard navigation keep their ring.
      let pointerFocused: HTMLElement | null = null;
      const markPointerFocus = (event: PointerEvent) => {
         pointerFocused = event.target instanceof HTMLElement ? (event.target.closest("button") ?? event.target) : null;
      };
      const releasePointerFocus = () => {
         if (pointerFocused && document.activeElement === pointerFocused) {
            pointerFocused.blur();
         }
         pointerFocused = null;
      };

      const handleKeyDown = (event: KeyboardEvent) => {
         if (event.repeat || isEditableTarget(event.target)) {
            return;
         }

         // Space activates whatever control is focused, so never claim it for a shortcut.
         if (event.key === " " && isInteractiveTarget(event.target)) {
            return;
         }

         const shortcut = shortcutsRef.current.find((candidate) => !candidate.disabled && matchesShortcut(event, candidate));
         if (!shortcut) {
            return;
         }

         if (shortcut.preventDefault !== false) {
            event.preventDefault();
         }

         if (shortcut.activationTargetId) {
            triggerShortcutActivation(shortcut.activationTargetId);
         }

         releasePointerFocus();
         shortcut.onPress();
      };

      window.addEventListener("keydown", handleKeyDown);
      window.addEventListener("pointerdown", markPointerFocus, true);

      return () => {
         window.removeEventListener("keydown", handleKeyDown);
         window.removeEventListener("pointerdown", markPointerFocus, true);
      };
   }, [enabled]);
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

const INTERACTIVE_TARGET_SELECTOR = "button, a, select, summary, label, [role='button'], [role='radio'], [role='checkbox'], [role='switch']";

function isInteractiveTarget(target: EventTarget | null) {
   return target instanceof HTMLElement && Boolean(target.closest(INTERACTIVE_TARGET_SELECTOR));
}
