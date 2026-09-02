import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties, SyntheticEvent } from "react";
import type { OsirisTokenSettings } from "../api/settings";
import type { IsoWeekday } from "../lib/date";
import type { DevClassStatusPreviewMode } from "../lib/devStatusPreview";
import { DEFAULT_GRID_HOURS, formatGridHour, GRID_HOUR_MAX, GRID_HOUR_MIN, type GridHourRange } from "../lib/gridHours";
import type { AgendaFoldingMode } from "../hooks/useAgendaFoldingPreference";
import { notifyError, notifySuccess, notifyWarning } from "../lib/notyf";
import { OSIRIS_BEARER_TOKEN_HELP_URL } from "../lib/osirisTokenHelp";
import { getThemeMode, THEMES_BY_MODE, type ThemeId, type ThemeMode } from "../lib/theme";
import { DEFAULT_SHOWN_WEEKDAYS, ISO_WEEKDAYS } from "../lib/weekLayout";
import { ActionButtons, ActionSelector, type ActionOption } from "./ActionGroup";
import { Button } from "./Button";
import { ConfirmDialog } from "./ConfirmDialog";
import { DevToolsSettings } from "./DevToolsSettings";
import { IconButton } from "./IconButton";
import { OverlayPanel, PANEL_CLOSE_MS } from "./OverlayPanel";
import { RangeSlider } from "./RangeSlider";
import { ToggleSwitch } from "./ToggleSwitch";
import "./SettingsDialog.css";

interface SettingsDialogProps {
   isOpen: boolean;
   areNotificationsBlocked: boolean;
   areNotificationsEnabled: boolean;
   areNotificationsSupported: boolean;
   areNotificationsUpdating: boolean;
   theme: ThemeId;
   shownWeekdays: IsoWeekday[];
   smartWeekdays: IsoWeekday[];
   isSmartDaysReady: boolean;
   gridHours: GridHourRange;
   smartGridHours: GridHourRange;
   agendaFoldingMode: AgendaFoldingMode;
   isDevToolsEnabled: boolean;
   perceivedNow: Date;
   timeOverride: Date | null;
   statusPreviewMode: DevClassStatusPreviewMode;
   tokenSettings: OsirisTokenSettings | null;
   isTokenLoading: boolean;
   onClose: () => void;
   onChangeNotifications: (enabled: boolean) => void;
   onChangeTheme: (theme: ThemeId) => void;
   onChangeShownWeekdays: (weekdays: IsoWeekday[]) => void;
   onChangeGridHours: (hours: GridHourRange) => void;
   onChangeAgendaFoldingMode: (mode: AgendaFoldingMode) => void;
   onSaveToken: (token: string) => Promise<OsirisTokenSettings>;
   onClearToken: () => Promise<OsirisTokenSettings>;
   onToggleDevTools: (enabled: boolean) => void;
   onChangeTimeOverride: (date: Date | null) => void;
   onChangeStatusPreviewMode: (mode: DevClassStatusPreviewMode) => void;
}

const IS_DEV_SERVER = import.meta.env.DEV;

const THEME_MODE_OPTIONS: readonly ActionOption<ThemeMode>[] = [
   { id: "dark", label: "Dark", tooltip: "Browse dark themes" },
   { id: "light", label: "Light", tooltip: "Browse light themes" },
];

const AGENDA_FOLDING_OPTIONS: readonly ActionOption<AgendaFoldingMode>[] = [
   { id: "single", label: "Single", tooltip: "Only open today automatically" },
   { id: "smart", label: "Smart", tooltip: "Open today and upcoming days with classes" },
   { id: "all", label: "All", tooltip: "Open every day automatically" },
];

// January 1st 2024 is a Monday, so ISO weekday N is that month's Nth day. The names are
// timezone-independent and must not touch the roster zone: the dialog can mount before the
// server has declared it.
const WEEKDAY_LABEL_FORMAT = new Intl.DateTimeFormat("en-GB", { weekday: "short", timeZone: "UTC" });
const WEEKDAY_LABELS: readonly string[] = ISO_WEEKDAYS.map((weekday) => WEEKDAY_LABEL_FORMAT.format(new Date(Date.UTC(2024, 0, weekday))));

export function SettingsDialog({
   isOpen,
   areNotificationsBlocked,
   areNotificationsEnabled,
   areNotificationsSupported,
   areNotificationsUpdating,
   theme,
   shownWeekdays,
   smartWeekdays,
   isSmartDaysReady,
   gridHours,
   smartGridHours,
   agendaFoldingMode,
   isDevToolsEnabled,
   perceivedNow,
   timeOverride,
   statusPreviewMode,
   tokenSettings,
   isTokenLoading,
   onClose,
   onChangeNotifications,
   onChangeTheme,
   onChangeShownWeekdays,
   onChangeGridHours,
   onChangeAgendaFoldingMode,
   onSaveToken,
   onClearToken,
   onToggleDevTools,
   onChangeTimeOverride,
   onChangeStatusPreviewMode,
}: SettingsDialogProps) {
   const [token, setToken] = useState("");
   const [isClosing, setIsClosing] = useState(false);
   const [isResetConfirmOpen, setIsResetConfirmOpen] = useState(false);
   const [themeMode, setThemeMode] = useState<ThemeMode>(() => getThemeMode(theme));
   const [animateThemePicker, setAnimateThemePicker] = useState(false);
   const visibleThemes = THEMES_BY_MODE[themeMode];
   const closeTimerRef = useRef<number | null>(null);
   const hasCustomToken = tokenSettings?.hasCustomToken === true;
   const hasBearerToken = tokenSettings?.hasBearerToken === true;
   const canSaveToken = token.trim().length > 0 && !isTokenLoading;
   const notificationDetail = !areNotificationsSupported
      ? "This browser does not support timetable notifications."
      : areNotificationsBlocked
        ? "Notifications are blocked in your browser settings."
        : areNotificationsEnabled
          ? "You'll get alerts when this week's classes change."
          : "Get an alert when this week's classes change.";

   const closeSettings = useCallback(() => {
      if (isClosing) {
         return;
      }

      setIsClosing(true);
      closeTimerRef.current = window.setTimeout(() => {
         setToken("");
         setThemeMode(getThemeMode(theme));
         setAnimateThemePicker(false);
         setIsClosing(false);
         onClose();
      }, PANEL_CLOSE_MS);
   }, [isClosing, onClose, theme]);

   useEffect(() => {
      return () => {
         if (closeTimerRef.current) {
            window.clearTimeout(closeTimerRef.current);
         }
      };
   }, []);

   const handleSubmit = async (event: SyntheticEvent<HTMLFormElement>) => {
      event.preventDefault();
      const nextToken = token.trim();
      if (!nextToken) {
         notifyWarning("Enter a bearer token first.");
         return;
      }

      try {
         await onSaveToken(nextToken);
         setToken("");
         notifySuccess("Osiris token saved successfully.");
      } catch (requestError) {
         notifyError(requestError, "Failed to save Osiris token.");
      }
   };

   const handleClear = useCallback(async () => {
      try {
         await onClearToken();
         setIsResetConfirmOpen(false);
         notifySuccess("Osiris token removed successfully.");
      } catch (requestError) {
         notifyError(requestError, "Failed to remove Osiris token.");
      }
   }, [onClearToken]);

   const closeResetConfirm = useCallback(() => setIsResetConfirmOpen(false), []);
   const confirmClear = useCallback(() => void handleClear(), [handleClear]);
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

         onChangeShownWeekdays(next);
      },
      [onChangeShownWeekdays, shownWeekdays]
   );

   const applySmartWeekdays = useCallback(
      () => onChangeShownWeekdays(smartWeekdays.length > 0 ? smartWeekdays : [...DEFAULT_SHOWN_WEEKDAYS]),
      [onChangeShownWeekdays, smartWeekdays]
   );
   const showMondayToFriday = useCallback(() => onChangeShownWeekdays([...DEFAULT_SHOWN_WEEKDAYS]), [onChangeShownWeekdays]);

   if (!isOpen && !isClosing) {
      return null;
   }

   return (
      <>
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

            <div className="settings-dialog__content">
               <section className="settings-section" aria-labelledby="notification-settings-title">
                  <div className="settings-section__header settings-section__header--with-control">
                     <div className="settings-section__copy">
                        <h3 id="notification-settings-title">Notifications</h3>
                        <p id="notification-settings-detail">{notificationDetail}</p>
                     </div>
                     <ToggleSwitch
                        checked={areNotificationsEnabled}
                        label="Notify me about class changes"
                        aria-describedby="notification-settings-detail"
                        aria-busy={areNotificationsUpdating}
                        disabled={!areNotificationsSupported || areNotificationsBlocked || areNotificationsUpdating}
                        onCheckedChange={onChangeNotifications}
                     />
                  </div>
               </section>

               <section className="settings-section" aria-labelledby="theme-settings-title">
                  <div className="settings-section__header settings-section__header--with-actions">
                     <div className="settings-section__copy">
                        <h3 id="theme-settings-title">Theme</h3>
                        <p>Colors for the whole app.</p>
                     </div>
                     <ActionSelector label="Theme modes" options={THEME_MODE_OPTIONS} value={themeMode} onChange={changeThemeMode} />
                  </div>

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
                              onClick={() => onChangeTheme(themeOption.id)}
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
                              onPress: () => onChangeGridHours(smartGridHours),
                           },
                           { id: "default", label: "Default", tooltip: "Show 08:00 to 18:00", onPress: () => onChangeGridHours(DEFAULT_GRID_HOURS) },
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
                     onChange={onChangeGridHours}
                  />
               </section>

               <section className="settings-section" aria-labelledby="agenda-folding-settings-title">
                  <div className="settings-section__header settings-section__header--with-actions">
                     <div className="settings-section__copy">
                        <h3 id="agenda-folding-settings-title">Agenda folding</h3>
                        <p>Which days open automatically when you view a week.</p>
                     </div>
                     <ActionSelector label="Agenda folding" options={AGENDA_FOLDING_OPTIONS} value={agendaFoldingMode} onChange={onChangeAgendaFoldingMode} />
                  </div>
               </section>

               <section className="settings-section" aria-labelledby="token-settings-title">
                  <div className="settings-section__header">
                     <div className="settings-section__copy">
                        <h3 id="token-settings-title">Roster access</h3>
                        <p>{hasCustomToken || hasBearerToken ? "Roster requests are using your saved bearer token." : "No bearer token is set."}</p>
                     </div>
                  </div>

                  <form className="settings-dialog__form" onSubmit={(event) => void handleSubmit(event)}>
                     <label className="settings-dialog__field">
                        <span className="settings-dialog__field-header">
                           <span>Bearer token</span>
                           <a href={OSIRIS_BEARER_TOKEN_HELP_URL} target="_blank" rel="noreferrer">
                              How to get one
                           </a>
                        </span>
                        <input
                           type="password"
                           value={token}
                           placeholder={hasCustomToken ? "Replace custom token" : "Bearer XXXXXXXXXXXXXXXXXXXXXXXXXXX"}
                           autoComplete="off"
                           spellCheck={false}
                           disabled={isTokenLoading}
                           onChange={(event) => setToken(event.target.value)}
                        />
                     </label>

                     <div className="settings-dialog__actions">
                        <Button variant="primary" type="submit" disabled={!canSaveToken}>
                           Save token
                        </Button>
                        <Button
                           variant="danger"
                           disabled={isTokenLoading || !hasCustomToken}
                           onClick={(event) => {
                              event.currentTarget.focus({ preventScroll: true });
                              setIsResetConfirmOpen(true);
                           }}
                        >
                           Reset
                        </Button>
                     </div>
                  </form>
               </section>

               {IS_DEV_SERVER ? (
                  <DevToolsSettings
                     isEnabled={isDevToolsEnabled}
                     perceivedNow={perceivedNow}
                     timeOverride={timeOverride}
                     statusPreviewMode={statusPreviewMode}
                     onToggle={onToggleDevTools}
                     onChangeTimeOverride={onChangeTimeOverride}
                     onChangeStatusPreviewMode={onChangeStatusPreviewMode}
                  />
               ) : null}
            </div>
         </OverlayPanel>

         <ConfirmDialog
            isOpen={isResetConfirmOpen}
            title="Reset bearer token?"
            detail="This will remove the saved bearer token and reload the roster."
            confirmLabel="Reset token"
            variant="danger"
            isConfirming={isTokenLoading}
            onCancel={closeResetConfirm}
            onConfirm={confirmClear}
         />
      </>
   );
}
