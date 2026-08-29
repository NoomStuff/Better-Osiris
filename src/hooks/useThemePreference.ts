import { useEffect, useState } from "react";
import { writeBrowserStorage } from "../lib/browserStorage";
import { applyTheme, getStoredTheme, THEME_STORAGE_KEY, type ThemeId } from "../lib/theme";

export function useThemePreference() {
   const [theme, setTheme] = useState<ThemeId>(getStoredTheme);

   useEffect(() => {
      applyTheme(theme, { animate: true });
      writeBrowserStorage("localStorage", THEME_STORAGE_KEY, theme);
   }, [theme]);

   return [theme, setTheme] as const;
}
