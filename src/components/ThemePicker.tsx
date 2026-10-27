import { useCallback, useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from "react";
import { usePreferences } from "../hooks/preferences";
import { THEMES_BY_MODE, type ThemeMode } from "../styles/themes/registry";
import { ActionSelector, type ActionOption } from "./ActionGroup";
import { ScrollableRow } from "./ScrollableRow";
import "./ThemePicker.css";

const THEME_MODE_OPTIONS: readonly ActionOption<ThemeMode>[] = [
   { id: "dark", label: "Dark", tooltip: "Browse dark themes" },
   { id: "light", label: "Light", tooltip: "Browse light themes" },
];

function centeredScrollLeft(scroller: HTMLDivElement, selected: HTMLButtonElement): number {
   // Both offsets use the row as their offset parent. Layout measurements ignore entrance transforms.
   return selected.offsetLeft - scroller.offsetLeft + selected.offsetWidth / 2 - scroller.clientWidth / 2;
}

interface ThemePickerProps {
   mode: ThemeMode | null;
   onModeChange: (mode: ThemeMode) => void;
   scrollPositionsRef: RefObject<Partial<Record<ThemeMode, number>>>;
}

export function ThemePicker({ mode, onModeChange, scrollPositionsRef }: ThemePickerProps) {
   const { theme, setTheme } = usePreferences();
   const themeMode = mode ?? (THEMES_BY_MODE.light.some((option) => option.id === theme) ? "light" : "dark");
   const scrollerRef = useRef<HTMLDivElement | null>(null);
   const [animateThemePicker, setAnimateThemePicker] = useState(false);
   const visibleThemes = THEMES_BY_MODE[themeMode];

   useLayoutEffect(() => {
      const scroller = scrollerRef.current;
      if (!scroller) return;

      const savedPosition = scrollPositionsRef.current[themeMode];
      const restorePosition = () => {
         const selected = scroller.querySelector<HTMLButtonElement>('[aria-pressed="true"]');
         scroller.scrollLeft = savedPosition ?? (selected ? centeredScrollLeft(scroller, selected) : 0);
      };
      restorePosition();
      const restoredPosition = scroller.scrollLeft;
      // The settings scrollbar can change the row's width after mounting.
      const observer = new ResizeObserver(() => {
         // Do not undo a scroll made before the first resize notification arrives.
         if (scroller.scrollLeft === restoredPosition) restorePosition();
         // Save only once layout settles, including React's repeated development effects.
         scrollPositionsRef.current[themeMode] = scroller.scrollLeft;
         observer.disconnect();
      });
      observer.observe(scroller);
      return () => observer.disconnect();
   }, [scrollPositionsRef, theme, themeMode]);
   const changeThemeMode = useCallback(
      (nextMode: ThemeMode) => {
         if (nextMode === themeMode) {
            return;
         }

         setAnimateThemePicker(true);
         onModeChange(nextMode);
      },
      [onModeChange, themeMode]
   );

   return (
      <section className="settings-section" aria-labelledby="theme-settings-title">
         <div className="settings-section__header settings-section__header--with-actions">
            <i className="settings-section__icon fa-solid fa-palette" aria-hidden="true" />
            <div className="settings-section__copy">
               <h3 id="theme-settings-title">Theme</h3>
               <p>Colors for the whole app.</p>
            </div>
            <ActionSelector label="Theme modes" options={THEME_MODE_OPTIONS} value={themeMode} onChange={changeThemeMode} />
         </div>

         <ScrollableRow
            scrollerRef={scrollerRef}
            onScrollPositionChange={(position) => {
               scrollPositionsRef.current[themeMode] = position;
            }}
         >
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
                        onClick={(event) => {
                           const scroller = scrollerRef.current;
                           if (scroller) {
                              scroller.scrollLeft = centeredScrollLeft(scroller, event.currentTarget);
                              scrollPositionsRef.current[themeMode] = scroller.scrollLeft;
                           }
                           setTheme(themeOption.id);
                        }}
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
