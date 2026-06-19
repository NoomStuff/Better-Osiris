import { useEffect, useState } from "react";
import type { SyntheticEvent } from "react";
import { clearOsirisToken, fetchOsirisTokenSettings, saveOsirisToken } from "../api/settings";
import { notifyError, notifySuccess, notifyWarning } from "../lib/notyf";
import { IconButton } from "./IconButton";
import "./SettingsDialog.css";

interface SettingsDialogProps {
   isOpen: boolean;
   isDevToolsEnabled: boolean;
   perceivedNow: Date;
   timeOverride: Date | null;
   onClose: () => void;
   onToggleDevTools: (enabled: boolean) => void;
   onChangeTimeOverride: (date: Date | null) => void;
}

const CURRENT_WEEK_CACHE_KEY = "roster-current-week-cache-v2";
const IS_DEV_SERVER = import.meta.env.DEV;
const DAY_MINUTES = 24 * 60;
const TIME_SLIDER_STEP_MINUTES = 15;

export function SettingsDialog({
   isOpen,
   isDevToolsEnabled,
   perceivedNow,
   timeOverride,
   onClose,
   onToggleDevTools,
   onChangeTimeOverride,
}: SettingsDialogProps) {
   const [token, setToken] = useState("");
   const [hasCustomToken, setHasCustomToken] = useState(false);
   const [isLoading, setIsLoading] = useState(false);
   const perceivedMinutes = perceivedNow.getHours() * 60 + perceivedNow.getMinutes();

   useEffect(() => {
      if (!isOpen) {
         return;
      }

      let isActive = true;

      fetchOsirisTokenSettings()
         .then((settings) => {
            if (isActive) {
               setHasCustomToken(settings.hasCustomToken);
            }
         })
         .catch((requestError: unknown) => {
            notifyError(requestError, "Failed to load settings.");
         });

      return () => {
         isActive = false;
      };
   }, [isOpen]);

   if (!isOpen) {
      return null;
   }

   const closeSettings = () => {
      setToken("");
      onClose();
   };

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

      setIsLoading(true);

      try {
         await saveOsirisToken(nextToken);
         notifySuccess("Osiris token saved successfully.");
         reloadRosterData();
      } catch (requestError) {
         notifyError(requestError, "Failed to save Osiris token.");
         setIsLoading(false);
      }
   };

   const handleClear = async () => {
      setIsLoading(true);

      try {
         await clearOsirisToken();
         notifySuccess("Osiris token removed successfully.");
         reloadRosterData();
      } catch (requestError) {
         notifyError(requestError, "Failed to remove Osiris token.");
         setIsLoading(false);
      }
   };

   return (
      <div className="settings-dialog" role="presentation">
         <button className="settings-dialog__backdrop" type="button" aria-label="Close settings" onClick={closeSettings} />
         <section className="settings-dialog__panel" role="dialog" aria-modal="true" aria-labelledby="settings-title">
            <header className="settings-dialog__header">
               <div>
                  <p className="eyebrow">Settings</p>
                  <h2 id="settings-title">Preferences</h2>
               </div>
               <IconButton icon="fa-solid fa-xmark" label="Close settings" variant="ghost" onClick={closeSettings} />
            </header>

            <div className="settings-dialog__content">
               <section className="settings-section" aria-labelledby="token-settings-title">
                  <div className="settings-section__header">
                     <h3 id="token-settings-title">Roster access</h3>
                     <p>{hasCustomToken ? "Roster requests are using your saved bearer token." : "Roster requests are using the server default."}</p>
                  </div>

                  <form className="settings-dialog__form" onSubmit={(event) => void handleSubmit(event)}>
                     <label className="settings-dialog__field">
                        <span>Bearer token</span>
                        <input
                           type="password"
                           value={token}
                           placeholder={hasCustomToken ? "Replace custom token" : "Bearer XXXXXXXXXXXXXXXXXXXXXXXXXXX"}
                           autoComplete="off"
                           spellCheck={false}
                           disabled={isLoading}
                           onChange={(event) => setToken(event.target.value)}
                        />
                     </label>

                     <div className="settings-dialog__actions">
                        <button className="settings-dialog__button settings-dialog__button--primary" type="submit" disabled={isLoading}>
                           Save token
                        </button>
                        <button className="settings-dialog__button" type="button" disabled={isLoading || !hasCustomToken} onClick={() => void handleClear()}>
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
                              <input type="date" value={formatDateInputValue(perceivedNow)} onChange={(event) => handleDateOverrideChange(event.target.value)} />
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
                        </div>
                     ) : null}
                  </section>
               ) : null}
            </div>
         </section>
      </div>
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

function reloadRosterData() {
   window.localStorage.removeItem(CURRENT_WEEK_CACHE_KEY);
   window.location.reload();
}
