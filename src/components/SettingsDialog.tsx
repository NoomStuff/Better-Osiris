import { NotificationSettings } from "./NotificationSettings";
import { RosterAccessSettings } from "./RosterAccessSettings";
import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import type { OsirisTokenValidationStatus } from "../types/osirisToken";
import type { IsoWeekday } from "../lib/date";
import { DEFAULT_GRID_HOURS, formatGridHour, GRID_HOUR_MAX, GRID_HOUR_MIN, type GridHourRange } from "../lib/gridHours";
import type { AgendaFoldingMode } from "../hooks/useAgendaFoldingPreference";
import { usePreferences } from "../hooks/preferences";
import { useOverlayScrollbar } from "../hooks/useOverlayScrollbar";
import { getDeviceThemeMode, THEMES_BY_MODE, type ThemeMode } from "../lib/theme";
import { DEFAULT_SHOWN_WEEKDAYS, ISO_WEEKDAYS } from "../lib/weekLayout";
import { ActionButtons, ActionSelector, type ActionOption } from "./ActionGroup";
import { Button } from "./Button";
import { DevToolsSettings } from "./DevToolsSettings";
import { IconButton } from "./IconButton";
import { OverlayPanel, PANEL_CLOSE_MS } from "./OverlayPanel";
import { RangeSlider } from "./RangeSlider";
import { ScrollableRow } from "./ScrollableRow";
import "./SettingsDialog.css";

interface SettingsDialogProps {
   isOpen: boolean;
   isSmartDaysReady: boolean;
   onClose: () => void;
   /** Cleared when the draft token changed or the dialog closed, so a failed save is not misreported. */
   onTokenDraftChange: () => void;
   onSaveToken: (token: string) => Promise<void>;
   smartGridHours: GridHourRange;
   smartWeekdays: IsoWeekday[];
   successfulTokenValidationKey: number | null;
   tokenValidationStatus: OsirisTokenValidationStatus;
}

const IS_DEV_SERVER = import.meta.env.DEV;

const THEME_MODE_OPTIONS: readonly ActionOption<ThemeMode>[] = [
   { id: "dark", label: "Dark", tooltip: "Browse dark themes" },
   { id: "light", label: "Light", tooltip: "Browse light themes" },
];

const AGENDA_FOLDING_OPTIONS: readonly ActionOption<AgendaFoldingMode>[] = [
   { id: "single", label: "Single", tooltip: "Open only the day of your next class across all weeks" },
   { id: "smart", label: "Smart", tooltip: "Open days with classes and today; close past days only in the home week" },
   { id: "all", label: "All", tooltip: "Open every day automatically" },
];

// January 1st 2024 is a Monday, so ISO weekday N is that month's Nth day. The names are
// timezone-independent and must not touch the roster zone: the dialog can mount before the
// server has declared it.
const WEEKDAY_LABEL_FORMAT = new Intl.DateTimeFormat("en-GB", { weekday: "short", timeZone: "UTC" });
const WEEKDAY_LABELS: readonly string[] = ISO_WEEKDAYS.map((weekday) => WEEKDAY_LABEL_FORMAT.format(new Date(Date.UTC(2024, 0, weekday))));

export function SettingsDialog({
   isOpen,
   isSmartDaysReady,
   onClose,
   onTokenDraftChange,
   onSaveToken,
   smartGridHours,
   smartWeekdays,
   successfulTokenValidationKey,
   tokenValidationStatus,
}: SettingsDialogProps) {
   const { agendaFoldingMode, gridHours, setAgendaFoldingMode, setGridHours, setShownWeekdays, setTheme, shownWeekdays, theme } = usePreferences();
   const contentRef = useOverlayScrollbar();
   const [isClosing, setIsClosing] = useState(false);
   const [themeMode, setThemeMode] = useState<ThemeMode>(getDeviceThemeMode);
   const [animateThemePicker, setAnimateThemePicker] = useState(false);
   const [wasOpen, setWasOpen] = useState(isOpen);
   if (wasOpen !== isOpen) {
      setWasOpen(isOpen);
      if (isOpen) setThemeMode(getDeviceThemeMode());
   }
   const visibleThemes = THEMES_BY_MODE[themeMode];
   const closeTimerRef = useRef<number | null>(null);

   const closeSettings = useCallback(() => {
      if (isClosing) {
         return;
      }

      setIsClosing(true);
      closeTimerRef.current = window.setTimeout(() => {
         onTokenDraftChange();
         setAnimateThemePicker(false);
         setIsClosing(false);
         onClose();
      }, PANEL_CLOSE_MS);
   }, [isClosing, onClose, onTokenDraftChange]);

   useEffect(() => {
      return () => {
         if (closeTimerRef.current) {
            window.clearTimeout(closeTimerRef.current);
         }
      };
   }, []);

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

   const toggleWeekday = useCallback(
      (weekday: IsoWeekday) => {
         if (shownWeekdays.length === 1 && shownWeekdays.includes(weekday)) {
            return;
         }

         const next = shownWeekdays.includes(weekday) ? shownWeekdays.filter((shown) => shown !== weekday) : [...shownWeekdays, weekday].sort((a, b) => a - b);

         setShownWeekdays(next);
      },
      [setShownWeekdays, shownWeekdays]
   );

   const applySmartWeekdays = useCallback(
      () => setShownWeekdays(smartWeekdays.length > 0 ? smartWeekdays : [...DEFAULT_SHOWN_WEEKDAYS]),
      [setShownWeekdays, smartWeekdays]
   );
   const showMondayToFriday = useCallback(() => setShownWeekdays([...DEFAULT_SHOWN_WEEKDAYS]), [setShownWeekdays]);

   if (!isOpen && !isClosing) {
      return null;
   }

   return (
      <OverlayPanel
         className="settings-dialog class-panel"
         backdropClassName="class-panel__backdrop"
         surfaceClassName="settings-dialog__panel class-panel__card"
         closeLabel="Close settings"
         labelledBy="settings-title"
         placement="bottom"
         isClosing={isClosing}
         closeOnSwipeDown
         swipeIgnoreSelector=".settings-dialog__content"
         onClose={closeSettings}
      >
         <header className="settings-dialog__header class-panel__header">
            <div className="class-panel__title">
               <p className="eyebrow">Settings</p>
               <h2 id="settings-title">Preferences</h2>
            </div>
            <IconButton className="class-panel__close" icon="fa-solid fa-xmark" label="Close settings" tooltipPlacement="bottom" onClick={closeSettings} />
         </header>

         <div ref={contentRef} className="settings-dialog__content">
            <NotificationSettings />

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
                              data-theme-id={themeOption.id}
                              style={{ "--theme-index": index } as CSSProperties}
                              onClick={() => setTheme(themeOption.id)}
                           >
                              <span className="theme-picker__surface">
                                 <span
                                    className="theme-picker__swatch"
                                    style={{ background: themeOption.swatchBackground, color: themeOption.swatchIconColor }}
                                 >
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

            <section className="settings-section" aria-labelledby="days-settings-title">
               <div className="settings-section__header settings-section__header--with-actions">
                  <div className="settings-section__copy">
                     <h3 id="days-settings-title">Shown days</h3>
                     <p>Which weekdays the agenda and grid display.</p>
                  </div>
                  <ActionButtons
                     label="Shown days actions"
                     actions={[
                        {
                           id: "smart",
                           label: "Smart",
                           tooltip: "Only show weekdays with classes",
                           disabled: !isSmartDaysReady,
                           onPress: applySmartWeekdays,
                        },
                        { id: "default", label: "Default", tooltip: "Show Monday through Friday", onPress: showMondayToFriday },
                     ]}
                  />
               </div>

               <div className="weekday-picker" role="group" aria-label="Shown weekdays">
                  {ISO_WEEKDAYS.map((weekday) => {
                     const isShown = shownWeekdays.includes(weekday);
                     const isLastShownDay = isShown && shownWeekdays.length === 1;

                     return (
                        <Button
                           key={weekday}
                           className="weekday-picker__option"
                           title={isLastShownDay ? "At least one day must stay shown" : undefined}
                           aria-pressed={isShown}
                           data-shown={isShown}
                           disabled={isLastShownDay}
                           onClick={() => toggleWeekday(weekday)}
                        >
                           {WEEKDAY_LABELS[weekday - 1]}
                        </Button>
                     );
                  })}
               </div>
            </section>

            <section className="settings-section" aria-labelledby="grid-hours-settings-title">
               <div className="settings-section__header settings-section__header--with-actions">
                  <div className="settings-section__copy">
                     <h3 id="grid-hours-settings-title">Grid hours</h3>
                     <p>The time range shown in the weekly grid.</p>
                  </div>
                  <ActionButtons
                     label="Grid hours actions"
                     actions={[
                        {
                           id: "smart",
                           label: "Smart",
                           tooltip: "Fit the hours to your loaded classes",
                           disabled: !isSmartDaysReady,
                           onPress: () => setGridHours(smartGridHours),
                        },
                        { id: "default", label: "Default", tooltip: "Show 08:00 to 18:00", onPress: () => setGridHours(DEFAULT_GRID_HOURS) },
                     ]}
                  />
               </div>

               <RangeSlider
                  label="Shown hours"
                  min={GRID_HOUR_MIN}
                  max={GRID_HOUR_MAX}
                  step={1}
                  value={gridHours}
                  startLabel="Grid start time"
                  endLabel="Grid end time"
                  formatValue={formatGridHour}
                  onChange={setGridHours}
               />
            </section>

            <section className="settings-section" aria-labelledby="agenda-folding-settings-title">
               <div className="settings-section__header settings-section__header--with-actions">
                  <div className="settings-section__copy">
                     <h3 id="agenda-folding-settings-title">Agenda folding</h3>
                     <p>Which days open automatically when you view a week.</p>
                  </div>
                  <ActionSelector label="Agenda folding" options={AGENDA_FOLDING_OPTIONS} value={agendaFoldingMode} onChange={setAgendaFoldingMode} />
               </div>
            </section>

            <RosterAccessSettings
               onTokenDraftChange={onTokenDraftChange}
               onSaveToken={onSaveToken}
               successfulTokenValidationKey={successfulTokenValidationKey}
               tokenValidationStatus={tokenValidationStatus}
            />

            {IS_DEV_SERVER ? <DevToolsSettings /> : null}
         </div>
      </OverlayPanel>
   );
}
