import { useCallback, useState, type CSSProperties } from "react";
import { usePreferences } from "../hooks/preferences";
import { getDeviceThemeMode } from "../lib/theme";
import { THEMES_BY_MODE, type ThemeMode } from "../styles/themes/registry";
import { ActionSelector, type ActionOption } from "./ActionGroup";
import { ScrollableRow } from "./ScrollableRow";
import "./ThemePicker.css";

const THEME_MODE_OPTIONS: readonly ActionOption<ThemeMode>[] = [
   { id: "dark", label: "Dark", tooltip: "Browse dark themes" },
   { id: "light", label: "Light", tooltip: "Browse light themes" },
];

export function ThemePicker() {
   const { theme, setTheme } = usePreferences();
   const [themeMode, setThemeMode] = useState<ThemeMode>(getDeviceThemeMode);
   const [animateThemePicker, setAnimateThemePicker] = useState(false);
   const visibleThemes = THEMES_BY_MODE[themeMode];
   const changeThemeMode = useCallback(
      (nextMode: ThemeMode) => {
         if (nextMode === themeMode) {
            return;
         }

         setAnimateThemePicker(true);
         setThemeMode(nextMode);
      },
      [themeMode]
   );

   return (
      <section className="settings-section" aria-labelledby="theme-settings-title">
         <div className="settings-section__header settings-section__header--with-actions">
            <div className="settings-section__copy">
               <h3 id="theme-settings-title">Theme</h3>
               <p>Colors for the whole app.</p>
            </div>
            <ActionSelector label="Theme modes" options={THEME_MODE_OPTIONS} value={themeMode} onChange={changeThemeMode} />
         </div>

         <ScrollableRow>
            <div key={themeMode} className={`theme-picker${animateThemePicker ? " theme-picker--animate" : ""}`} role="group" aria-label="Color theme">
               {visibleThemes.map((themeOption, index) => {
                  const isActive = theme === themeOption.id;

                  return (
                     <button
                        type="button"
                        key={themeOption.id}
                        className="theme-picker__option"
                        title={themeOption.label}
                        aria-pressed={isActive}
                        data-active={isActive}
                        data-theme-motion={themeOption.motion}
                        style={{ "--theme-index": index } as CSSProperties}
                        onClick={() => setTheme(themeOption.id)}
                     >
                        <span className="theme-picker__surface">
                           <span className="theme-picker__swatch" data-theme={themeOption.id}>
                              <i className={themeOption.icon} aria-hidden="true" />
                           </span>
                           <span className="theme-picker__label">{themeOption.label}</span>
                        </span>
                     </button>
                  );
               })}
            </div>
         </ScrollableRow>
      </section>
   );
}
