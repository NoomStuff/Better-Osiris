import { useEffect, useLayoutEffect, useRef } from "react";
import { triggerShortcutActivation } from "./useShortcutActivation";

export const HOLD_REPEAT_INITIAL_DELAY_MS = 500;
export const HOLD_REPEAT_INTERVAL_MS = 150;

export interface KeyboardShortcut {
   id: string;
   key: string;
   altKey?: boolean;
   ctrlKey?: boolean;
   metaKey?: boolean;
   shiftKey?: boolean;
   disabled?: boolean;
   preventDefault?: boolean;
   repeat?: boolean;
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
      let repeatTimeout: number | undefined;
      let repeatedShortcut: { id: string; key: string } | null = null;
      const markPointerFocus = (event: PointerEvent) => {
         pointerFocused = event.target instanceof HTMLElement ? (event.target.closest("button") ?? event.target) : null;
      };
      const releasePointerFocus = () => {
         if (pointerFocused && document.activeElement === pointerFocused) {
            pointerFocused.blur();
         }
         pointerFocused = null;
      };
      const stopRepeat = () => {
         window.clearTimeout(repeatTimeout);
         repeatTimeout = undefined;
         repeatedShortcut = null;
      };
      const invokeShortcut = (shortcut: KeyboardShortcut) => {
         if (shortcut.activationTargetId) {
            triggerShortcutActivation(shortcut.activationTargetId);
         }

         releasePointerFocus();
         shortcut.onPress();
      };
      const scheduleRepeat = (shortcut: KeyboardShortcut, delay: number) => {
         repeatedShortcut = { id: shortcut.id, key: shortcut.key };
         repeatTimeout = window.setTimeout(() => {
            const currentShortcut = shortcutsRef.current.find((candidate) => candidate.id === shortcut.id && !candidate.disabled);
            if (!currentShortcut || !repeatedShortcut) {
               stopRepeat();
               return;
            }

            invokeShortcut(currentShortcut);
            scheduleRepeat(currentShortcut, HOLD_REPEAT_INTERVAL_MS);
         }, delay);
      };

      const handleKeyDown = (event: KeyboardEvent) => {
         if (isEditableTarget(event.target)) {
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

         if (event.repeat) {
            if (shortcut.repeat && shortcut.preventDefault !== false) {
               event.preventDefault();
            }
            return;
         }

         if (shortcut.preventDefault !== false) {
            event.preventDefault();
         }

         invokeShortcut(shortcut);

         if (shortcut.repeat) {
            stopRepeat();
            scheduleRepeat(shortcut, HOLD_REPEAT_INITIAL_DELAY_MS);
         }
      };

      const handleKeyUp = (event: KeyboardEvent) => {
         if (repeatedShortcut?.key.toLowerCase() === event.key.toLowerCase()) {
            stopRepeat();
         }
      };

      window.addEventListener("keydown", handleKeyDown);
      window.addEventListener("keyup", handleKeyUp);
      window.addEventListener("blur", stopRepeat);
      window.addEventListener("pointerdown", markPointerFocus, true);

      return () => {
         stopRepeat();
         window.removeEventListener("keydown", handleKeyDown);
         window.removeEventListener("keyup", handleKeyUp);
         window.removeEventListener("blur", stopRepeat);
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
