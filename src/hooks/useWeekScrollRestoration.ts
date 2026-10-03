import { useEffect, useLayoutEffect, useRef } from "react";
import { readBrowserStorage, writeBrowserStorage } from "../lib/browserStorage";

const STORAGE_KEY = "roster-scroll-positions";
const MAX_TRACKED_KEYS = 100;
const PERSIST_DELAY_MS = 400;

// Shared across mounts so switching weeks never loses a position; mirrored to
// sessionStorage so a reload reopens the same view at the same reading position.
const positions = loadPositions();
let persistTimer: number | undefined;

function loadPositions() {
   const raw = readBrowserStorage("sessionStorage", STORAGE_KEY);
   if (!raw) {
      return new Map<string, number>();
   }

   try {
      const parsed: unknown = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
         return new Map<string, number>();
      }

      return new Map(
         Object.entries(parsed as Record<string, unknown>).filter(
            (entry): entry is [string, number] => typeof entry[1] === "number" && Number.isFinite(entry[1])
         )
      );
   } catch {
      return new Map<string, number>();
   }
}

function persistPositions() {
   while (positions.size > MAX_TRACKED_KEYS) {
      const oldest = positions.keys().next().value;
      if (oldest === undefined) {
         break;
      }
      positions.delete(oldest);
   }
   writeBrowserStorage("sessionStorage", STORAGE_KEY, JSON.stringify(Object.fromEntries(positions)));
}

function schedulePersist() {
   window.clearTimeout(persistTimer);
   persistTimer = window.setTimeout(persistPositions, PERSIST_DELAY_MS);
}

function bankPosition(key: string) {
   positions.delete(key);
   positions.set(key, window.scrollY);
   schedulePersist();
}

/**
 * Remembers the page scroll position per view-and-week key and restores it when that
 * combination gains content again. Week content remounts on every navigation, so without
 * this, going back to a week you were reading always drops you at the top.
 */
export function useWeekScrollRestoration(key: string | null, hasContent: boolean) {
   const activeKeyRef = useRef<string | null>(null);
   const restoredKeyRef = useRef<string | null>(null);

   // Keep the on-screen week's position current while the user scrolls.
   useEffect(() => {
      let frame: number | null = null;
      const handleScroll = () => {
         if (frame !== null || activeKeyRef.current === null) {
            return;
         }
         frame = window.requestAnimationFrame(() => {
            frame = null;
            if (activeKeyRef.current !== null) {
               bankPosition(activeKeyRef.current);
            }
         });
      };
      window.addEventListener("scroll", handleScroll, { passive: true });
      window.addEventListener("pagehide", persistPositions);
      return () => {
         window.removeEventListener("scroll", handleScroll);
         window.removeEventListener("pagehide", persistPositions);
         if (frame !== null) {
            window.cancelAnimationFrame(frame);
         }
      };
   }, []);

   // Bank the outgoing position before the remount repaints, then restore the incoming one
   // once its content exists, so async week loads still land where they were left.
   useLayoutEffect(() => {
      const previousKey = activeKeyRef.current;
      if (previousKey !== null && previousKey !== key) {
         bankPosition(previousKey);
      }
      activeKeyRef.current = key;

      if (key === null || !hasContent || restoredKeyRef.current === key) {
         return;
      }
      restoredKeyRef.current = key;
      // A week seen before reopens where it was left; a fresh one starts at the top instead of
      // inheriting whatever offset the outgoing week happened to sit at.
      const target = positions.get(key) ?? 0;
      if (target !== window.scrollY) {
         window.scrollTo(0, target);
      }
   }, [key, hasContent]);
}
