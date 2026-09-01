import { readBrowserStorage } from "./browserStorage";

export type ThemeId = "dark" | "light" | "frost" | "espresso" | "dusk" | "moss" | "ember" | "osiris";

export interface Theme {
   id: ThemeId;
   label: string;
   icon: string;
   swatchBackground: string;
   swatchIconColor: string;
}

export const THEMES: readonly Theme[] = [
   { id: "dark", label: "Night", icon: "fa-solid fa-moon", swatchBackground: "#0a0d14", swatchIconColor: "#7cc7ff" },
   { id: "light", label: "Light", icon: "fa-solid fa-sun", swatchBackground: "#f2f5fa", swatchIconColor: "#1468c8" },
   { id: "frost", label: "Frost", icon: "fa-solid fa-snowflake", swatchBackground: "#262b3a", swatchIconColor: "#88c0d0" },
   { id: "espresso", label: "Espresso", icon: "fa-solid fa-mug-hot", swatchBackground: "#f7f1e6", swatchIconColor: "#bc5308" },
   { id: "dusk", label: "Dusk", icon: "fa-solid fa-cloud-sun", swatchBackground: "#1c1628", swatchIconColor: "#e08a9b" },
   { id: "moss", label: "Moss", icon: "fa-solid fa-leaf", swatchBackground: "#f2f7ec", swatchIconColor: "#43832f" },
   { id: "ember", label: "Ember", icon: "fa-solid fa-fire", swatchBackground: "#1e1418", swatchIconColor: "#e56b3c" },
   { id: "osiris", label: "Osiris", icon: "fa-solid fa-graduation-cap", swatchBackground: "#eef0f4", swatchIconColor: "#5e2170" },
];

export const DEFAULT_THEME: ThemeId = "dark";
export const THEME_STORAGE_KEY = "roster-theme";

const THEME_FADE_CLASS = "theme-fade";
const THEME_FADE_MS = 400;

let fadeTimeoutId: number | null = null;

export function isThemeId(value: string | null): value is ThemeId {
   return THEMES.some((theme) => theme.id === value);
}

export function getStoredTheme(): ThemeId {
   const stored = readBrowserStorage("localStorage", THEME_STORAGE_KEY);
   return isThemeId(stored) ? stored : DEFAULT_THEME;
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
