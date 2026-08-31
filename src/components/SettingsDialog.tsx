import { useCallback, useEffect, useRef, useState } from "react";
import type { SyntheticEvent } from "react";
import type { OsirisTokenSettings } from "../api/settings";
import type { IsoWeekday } from "../lib/date";
import type { DevClassStatusPreviewMode } from "../lib/devStatusPreview";
import { notifyError, notifySuccess, notifyWarning } from "../lib/notyf";
import { OSIRIS_BEARER_TOKEN_HELP_URL } from "../lib/osirisTokenHelp";
import { THEMES, type ThemeId } from "../lib/theme";
import { ISO_WEEKDAYS } from "../lib/weekLayout";
import { ConfirmDialog } from "./ConfirmDialog";
import { DevToolsSettings } from "./DevToolsSettings";
import { IconButton } from "./IconButton";
import { OverlayPanel, PANEL_CLOSE_MS } from "./OverlayPanel";
import "./SettingsDialog.css";

interface SettingsDialogProps {
   isOpen: boolean;
   theme: ThemeId;
   shownWeekdays: IsoWeekday[];
   isDevToolsEnabled: boolean;
   perceivedNow: Date;
   timeOverride: Date | null;
   statusPreviewMode: DevClassStatusPreviewMode;
   tokenSettings: OsirisTokenSettings | null;
   isTokenLoading: boolean;
   onClose: () => void;
   onChangeTheme: (theme: ThemeId) => void;
   onChangeShownWeekdays: (weekdays: IsoWeekday[]) => void;
   onSaveToken: (token: string) => Promise<OsirisTokenSettings>;
   onClearToken: () => Promise<OsirisTokenSettings>;
   onToggleDevTools: (enabled: boolean) => void;
   onChangeTimeOverride: (date: Date | null) => void;
   onChangeStatusPreviewMode: (mode: DevClassStatusPreviewMode) => void;
}

const IS_DEV_SERVER = import.meta.env.DEV;

// January 1st 2024 is a Monday, so ISO weekday N is that month's Nth day. The names are
// timezone-independent and must not touch the roster zone: the dialog can mount before the
// server has declared it.
const WEEKDAY_LABEL_FORMAT = new Intl.DateTimeFormat("en-GB", { weekday: "short", timeZone: "UTC" });
const WEEKDAY_LABELS: readonly string[] = ISO_WEEKDAYS.map((weekday) => WEEKDAY_LABEL_FORMAT.format(new Date(Date.UTC(2024, 0, weekday))));

export function SettingsDialog({
   isOpen,
   theme,
   shownWeekdays,
   isDevToolsEnabled,
   perceivedNow,
   timeOverride,
   statusPreviewMode,
   tokenSettings,
   isTokenLoading,
   onClose,
   onChangeTheme,
   onChangeShownWeekdays,
   onSaveToken,
   onClearToken,
   onToggleDevTools,
   onChangeTimeOverride,
   onChangeStatusPreviewMode,
}: SettingsDialogProps) {
   const [token, setToken] = useState("");
   const [isClosing, setIsClosing] = useState(false);
   const [isResetConfirmOpen, setIsResetConfirmOpen] = useState(false);
   const closeTimerRef = useRef<number | null>(null);
   const hasCustomToken = tokenSettings?.hasCustomToken === true;
   const hasBearerToken = tokenSettings?.hasBearerToken === true;
   const canSaveToken = token.trim().length > 0 && !isTokenLoading;

   const closeSettings = useCallback(() => {
      if (isClosing) {
         return;
      }

      setIsClosing(true);
      closeTimerRef.current = window.setTimeout(() => {
         setToken("");
         setIsClosing(false);
         onClose();
      }, PANEL_CLOSE_MS);
   }, [isClosing, onClose]);

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

   const toggleWeekday = useCallback(
      (weekday: IsoWeekday) => {
         const next = shownWeekdays.includes(weekday) ? shownWeekdays.filter((shown) => shown !== weekday) : [...shownWeekdays, weekday].sort((a, b) => a - b);

         onChangeShownWeekdays(next);
      },
      [onChangeShownWeekdays, shownWeekdays]
   );

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
               <section className="settings-section" aria-labelledby="theme-settings-title">
                  <div className="settings-section__header">
                     <h3 id="theme-settings-title">Theme</h3>
                     <p>Colors for the whole app.</p>
                  </div>

                  <div className="theme-picker" role="group" aria-label="Color theme">
                     {THEMES.map((themeOption) => {
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
                              onClick={() => onChangeTheme(themeOption.id)}
                           >
                              <span
                                 className="theme-picker__swatch"
                                 style={{ backgroundColor: themeOption.swatchBackground, color: themeOption.swatchIconColor }}
                              >
                                 <i className={themeOption.icon} aria-hidden="true" />
                              </span>
                              <span className="theme-picker__label">{themeOption.label}</span>
                           </button>
                        );
                     })}
                  </div>
               </section>

               <section className="settings-section" aria-labelledby="days-settings-title">
                  <div className="settings-section__header">
                     <h3 id="days-settings-title">Shown days</h3>
                     <p>Which weekdays the agenda and grid display.</p>
                  </div>

                  <div className="weekday-picker" role="group" aria-label="Shown weekdays">
                     {ISO_WEEKDAYS.map((weekday) => {
                        const isShown = shownWeekdays.includes(weekday);
                        const isLastShownDay = isShown && shownWeekdays.length === 1;

                        return (
                           <button
                              type="button"
                              key={weekday}
                              className="weekday-picker__option"
                              title={isLastShownDay ? "At least one day must stay shown" : undefined}
                              aria-pressed={isShown}
                              data-shown={isShown}
                              disabled={isLastShownDay}
                              onClick={() => toggleWeekday(weekday)}
                           >
                              {WEEKDAY_LABELS[weekday - 1]}
                           </button>
                        );
                     })}
                  </div>
               </section>

               <section className="settings-section" aria-labelledby="token-settings-title">
                  <div className="settings-section__header">
                     <h3 id="token-settings-title">Roster access</h3>
                     <p>{hasCustomToken || hasBearerToken ? "Roster requests are using your saved bearer token." : "No bearer token is set."}</p>
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
                        <button className="settings-dialog__button settings-dialog__button--primary" type="submit" disabled={!canSaveToken}>
                           Save token
                        </button>
                        <button
                           className="settings-dialog__button settings-dialog__button--danger"
                           type="button"
                           disabled={isTokenLoading || !hasCustomToken}
                           onClick={(event) => {
                              event.currentTarget.focus({ preventScroll: true });
                              setIsResetConfirmOpen(true);
                           }}
                        >
                           Reset
                        </button>
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
