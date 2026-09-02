import { readBrowserStorage } from "./browserStorage";

export type ThemeMode = "dark" | "light";

interface Theme {
   id: string;
   label: string;
   icon: string;
   swatchBackground: string;
   swatchIconColor: string;
}

/* Equivalent themes share their position across these two lists. Themes without an
   equivalent stay after the paired entries. */
export const THEMES_BY_MODE = {
   dark: [
      { id: "dark", label: "Dark", icon: "fa-solid fa-moon", swatchBackground: "#0a0d14", swatchIconColor: "#7cc7ff" },
      { id: "frost", label: "Frost", icon: "fa-solid fa-snowflake", swatchBackground: "#1f2b3a", swatchIconColor: "#88c0d0" },
      { id: "espresso", label: "Espresso", icon: "fa-solid fa-mug-hot", swatchBackground: "#35191d", swatchIconColor: "#ed8a63" },
      { id: "moss", label: "Moss", icon: "fa-solid fa-leaf", swatchBackground: "#1d2719", swatchIconColor: "#94c96e" },
      { id: "dusk", label: "Dusk", icon: "fa-solid fa-cloud-sun", swatchBackground: "#24233f", swatchIconColor: "#e08a9b" },
      { id: "ember", label: "Ember", icon: "fa-solid fa-fire", swatchBackground: "#1c0806", swatchIconColor: "#ff7547" },
      { id: "abyss", label: "Abyss", icon: "fa-solid fa-water", swatchBackground: "#061c2a", swatchIconColor: "#5de1d4" },
      { id: "noir", label: "Noir", icon: "fa-solid fa-hat-cowboy-side", swatchBackground: "#000000", swatchIconColor: "#f0f0f0" },
      { id: "contrast", label: "Contrast", icon: "fa-solid fa-circle-half-stroke", swatchBackground: "#050505", swatchIconColor: "#d7ff3f" },
   ],
   light: [
      { id: "light", label: "Light", icon: "fa-solid fa-sun", swatchBackground: "#f2f5fa", swatchIconColor: "#1468c8" },
      { id: "thaw", label: "Thaw", icon: "fa-solid fa-snowflake", swatchBackground: "#f4eade", swatchIconColor: "#08707a" },
      { id: "latte", label: "Latte", icon: "fa-solid fa-mug-hot", swatchBackground: "#f2ede5", swatchIconColor: "#b02f00" },
      { id: "ivy", label: "Ivy", icon: "fa-solid fa-leaf", swatchBackground: "#edf3e7", swatchIconColor: "#2c661d" },
      { id: "dawn", label: "Dawn", icon: "fa-solid fa-cloud-sun", swatchBackground: "#efdaff", swatchIconColor: "#81275e" },
      { id: "flare", label: "Flare", icon: "fa-solid fa-fire", swatchBackground: "#ffcbcb", swatchIconColor: "#af0043" },
      { id: "bloom", label: "Bloom", icon: "fa-solid fa-spa", swatchBackground: "#d5eadb", swatchIconColor: "#741763" },
      { id: "paper", label: "Paper", icon: "fa-solid fa-newspaper", swatchBackground: "#eadfc2", swatchIconColor: "#8a361f" },
      { id: "osiris", label: "Osiris", icon: "fa-solid fa-graduation-cap", swatchBackground: "#eef0f4", swatchIconColor: "#5e2170" },
   ],
} as const satisfies Record<ThemeMode, readonly Theme[]>;

export type ThemeId = (typeof THEMES_BY_MODE)[ThemeMode][number]["id"];

const ALL_THEMES: readonly Theme[] = [...THEMES_BY_MODE.dark, ...THEMES_BY_MODE.light];

export const DEFAULT_THEME: ThemeId = "dark";
export const THEME_STORAGE_KEY = "roster-theme";

const THEME_FADE_CLASS = "theme-fade";
const THEME_FADE_MS = 400;

let fadeTimeoutId: number | null = null;

export function isThemeId(value: string | null): value is ThemeId {
   return ALL_THEMES.some((theme) => theme.id === value);
}

export function getThemeMode(theme: ThemeId): ThemeMode {
   return THEMES_BY_MODE.light.some((option) => option.id === theme) ? "light" : "dark";
}

export function getStoredTheme(): ThemeId {
   const stored = readBrowserStorage("localStorage", THEME_STORAGE_KEY);
   return isThemeId(stored) ? stored : getPreferredDefaultTheme();
}

/* Without a saved preference, the mode primaries (Dark and Light) double as the defaults:
   follow the system color scheme, falling back to dark when it cannot be read. */
function getPreferredDefaultTheme(): ThemeId {
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
