import { useCallback, useEffect, useRef, useState } from "react";
import type { SyntheticEvent } from "react";
import type { OsirisTokenSettings } from "../api/settings";
import { DEV_LESSON_STATUS_PREVIEW_MODES, type DevLessonStatusPreviewMode } from "../lib/devRosterStatusPreview";
import { notifyError, notifySuccess, notifyWarning } from "../lib/notyf";
import { OSIRIS_BEARER_TOKEN_HELP_URL } from "../lib/osirisTokenHelp";
import { ConfirmDialog } from "./ConfirmDialog";
import { IconButton } from "./IconButton";
import { OverlayPanel } from "./OverlayPanel";
import "./SettingsDialog.css";

interface SettingsDialogProps {
   isOpen: boolean;
   isDevToolsEnabled: boolean;
   perceivedNow: Date;
   timeOverride: Date | null;
   statusPreviewMode: DevLessonStatusPreviewMode;
   tokenSettings: OsirisTokenSettings | null;
   isTokenLoading: boolean;
   onClose: () => void;
   onSaveToken: (token: string) => Promise<OsirisTokenSettings>;
   onClearToken: () => Promise<OsirisTokenSettings>;
   onToggleDevTools: (enabled: boolean) => void;
   onChangeTimeOverride: (date: Date | null) => void;
   onChangeStatusPreviewMode: (mode: DevLessonStatusPreviewMode) => void;
}

const IS_DEV_SERVER = import.meta.env.DEV;
const DAY_MINUTES = 24 * 60;
const TIME_SLIDER_STEP_MINUTES = 15;

export function SettingsDialog({
   isOpen,
   isDevToolsEnabled,
   perceivedNow,
   timeOverride,
   statusPreviewMode,
   tokenSettings,
   isTokenLoading,
   onClose,
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
   const perceivedMinutes = perceivedNow.getHours() * 60 + perceivedNow.getMinutes();
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
      }, 240);
   }, [isClosing, onClose]);

   useEffect(() => {
      return () => {
         if (closeTimerRef.current) {
            window.clearTimeout(closeTimerRef.current);
         }
      };
   }, []);

   const handleDateOverrideChange = (value: string) => {
      const [yearText, monthText, dayText] = value.split("-");
      const year = Number(yearText);
      const month = Number(monthText);
      const day = Number(dayText);

      if ([year, month, day].some((valuePart) => Number.isNaN(valuePart))) {
         return;
      }

      const nextDate = new Date(perceivedNow);
      nextDate.setFullYear(year, month - 1, day);
      onChangeTimeOverride(nextDate);
   };

   const handleTimeOverrideChange = (value: string) => {
      const nextMinutes = Number(value);

      if (Number.isNaN(nextMinutes)) {
         return;
      }

      const nextDate = new Date(perceivedNow);
      nextDate.setHours(Math.floor(nextMinutes / 60), nextMinutes % 60, 0, 0);
      onChangeTimeOverride(nextDate);
   };

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

   if (!isOpen && !isClosing) {
      return null;
   }

   return (
      <>
         <OverlayPanel
            className="settings-dialog lesson-panel"
            backdropClassName="lesson-panel__backdrop"
            surfaceClassName="settings-dialog__panel lesson-panel__card"
            closeLabel="Close settings"
            labelledBy="settings-title"
            placement="bottom"
            isClosing={isClosing}
            closeOnSwipeDown
            swipeIgnoreSelector=".settings-dialog__content"
            onClose={closeSettings}
         >
            <header className="settings-dialog__header lesson-panel__header">
               <div className="lesson-panel__title">
                  <p className="eyebrow">Settings</p>
                  <h2 id="settings-title">Preferences</h2>
               </div>
               <IconButton
                  className="lesson-panel__close"
                  icon="fa-solid fa-xmark"
                  label="Close settings"
                  tooltipPlacement="bottom"
                  tooltipAlign="end"
                  onClick={closeSettings}
               />
            </header>

            <div className="settings-dialog__content">
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
                           onClick={() => setIsResetConfirmOpen(true)}
                        >
                           Reset
                        </button>
                     </div>
                  </form>
               </section>

               {IS_DEV_SERVER ? (
                  <section className="settings-section" aria-labelledby="devtools-settings-title">
                     <div className="settings-section__header">
                        <h3 id="devtools-settings-title">Devtools</h3>
                        <p>Local-only roster testing tools. These controls are not available in production.</p>
                     </div>

                     <label className="settings-toggle">
                        <input type="checkbox" checked={isDevToolsEnabled} onChange={(event) => onToggleDevTools(event.target.checked)} />
                        <span>
                           <strong>Enable devtools</strong>
                           <small>
                              {timeOverride
                                 ? `Override: ${formatDateLabel(timeOverride)} ${formatTimeLabel(timeOverride)}`
                                 : `Real time: ${formatDateLabel(perceivedNow)} ${formatTimeLabel(perceivedNow)}`}
                           </small>
                        </span>
                     </label>

                     {isDevToolsEnabled ? (
                        <div className="devtools-panel">
                           <label className="settings-dialog__field settings-dialog__field--compact">
                              <span>Perceived date</span>
                              <input
                                 type="date"
                                 value={formatDateInputValue(perceivedNow)}
                                 onChange={(event) => handleDateOverrideChange(event.target.value)}
                              />
                           </label>

                           <div className="time-slider">
                              <div className="time-slider__header">
                                 <span>Perceived time</span>
                                 <strong>{formatTimeLabel(perceivedNow)}</strong>
                              </div>
                              <input
                                 type="range"
                                 min={0}
                                 max={DAY_MINUTES - TIME_SLIDER_STEP_MINUTES}
                                 step={TIME_SLIDER_STEP_MINUTES}
                                 value={Math.round(perceivedMinutes / TIME_SLIDER_STEP_MINUTES) * TIME_SLIDER_STEP_MINUTES}
                                 onChange={(event) => handleTimeOverrideChange(event.target.value)}
                              />
                              <div className="time-slider__ticks" aria-hidden="true">
                                 <span>00:00</span>
                                 <span>06:00</span>
                                 <span>12:00</span>
                                 <span>18:00</span>
                                 <span>23:45</span>
                              </div>
                           </div>

                           <div className="settings-dialog__actions">
                              <button className="settings-dialog__button" type="button" onClick={() => onChangeTimeOverride(new Date())}>
                                 Use current time
                              </button>
                              <button className="settings-dialog__button" type="button" disabled={!timeOverride} onClick={() => onChangeTimeOverride(null)}>
                                 Clear override
                              </button>
                           </div>

                           <div className="devtools-option">
                              <span className="devtools-option__label">Lesson diff preview</span>
                              <div className="settings-segmented-control" role="group" aria-label="Lesson diff preview">
                                 {DEV_LESSON_STATUS_PREVIEW_MODES.map((mode) => (
                                    <button
                                       type="button"
                                       key={mode.id}
                                       aria-pressed={statusPreviewMode === mode.id}
                                       data-active={statusPreviewMode === mode.id}
                                       onClick={() => onChangeStatusPreviewMode(mode.id)}
                                    >
                                       {mode.label}
                                    </button>
                                 ))}
                              </div>
                           </div>
                        </div>
                     ) : null}
                  </section>
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

function formatTimeLabel(date: Date) {
   const hours = String(date.getHours()).padStart(2, "0");
   const minutes = String(date.getMinutes()).padStart(2, "0");

   return `${hours}:${minutes}`;
}

function formatDateInputValue(date: Date) {
   const year = date.getFullYear();
   const month = String(date.getMonth() + 1).padStart(2, "0");
   const day = String(date.getDate()).padStart(2, "0");

   return `${year}-${month}-${day}`;
}

function formatDateLabel(date: Date) {
   const day = String(date.getDate()).padStart(2, "0");
   const month = String(date.getMonth() + 1).padStart(2, "0");

   return `${day}-${month}`;
}
