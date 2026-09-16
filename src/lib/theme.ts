import { readBrowserStorage } from "./browserStorage";
import { THEMES_BY_MODE, type Theme, type ThemeId, type ThemeMode } from "../styles/themes/registry";

const ALL_THEMES: readonly Theme[] = [...THEMES_BY_MODE.dark, ...THEMES_BY_MODE.light];

export const DEFAULT_THEME = "dark" satisfies ThemeId;
export const THEME_STORAGE_KEY = "roster-theme";

const THEME_FADE_CLASS = "theme-fade";
const THEME_FADE_MS = 400;

let fadeTimeoutId: number | null = null;

export function isThemeId(value: string | null): value is ThemeId {
   return ALL_THEMES.some((theme) => theme.id === value);
}

export function getStoredTheme(): ThemeId {
   const stored = readBrowserStorage("localStorage", THEME_STORAGE_KEY);
   return isThemeId(stored) ? stored : getDeviceThemeMode();
}

/* Without a saved preference, the mode primaries (Dark and Light) double as the defaults:
   follow the system color scheme, falling back to dark when it cannot be read. */
export function getDeviceThemeMode(): ThemeMode {
   if (typeof window === "undefined") {
      return DEFAULT_THEME;
   }

   // Cast to optional: tests stub a window that has no matchMedia.
   const matchMedia = (window as { matchMedia?: (query: string) => { matches: boolean } }).matchMedia;
   return matchMedia?.("(prefers-color-scheme: light)").matches ? "light" : DEFAULT_THEME;
}

export function applyTheme(theme: ThemeId, options: { animate?: boolean } = {}) {
   const root = document.documentElement;
   if (root.getAttribute("data-theme") === theme) {
      return;
   }

   if (options.animate === true && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      root.classList.add(THEME_FADE_CLASS);

      if (fadeTimeoutId !== null) {
         window.clearTimeout(fadeTimeoutId);
      }

      fadeTimeoutId = window.setTimeout(() => {
         root.classList.remove(THEME_FADE_CLASS);
         fadeTimeoutId = null;
      }, THEME_FADE_MS);
   }

   root.setAttribute("data-theme", theme);
   const themeColor = getComputedStyle(root).getPropertyValue("--page-canvas").trim();
   if (themeColor) {
      document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.setAttribute("content", themeColor);
   }
}
