import { useEffect, useState } from "react";
import type { SyntheticEvent } from "react";
import { clearOsirisToken, fetchOsirisTokenSettings, saveOsirisToken } from "../api/settings";
import { logError } from "../lib/notify";
import "./SettingsDialog.css";

interface SettingsDialogProps {
   isOpen: boolean;
   onClose: () => void;
}

const CURRENT_WEEK_CACHE_KEY = "roster-current-week-cache-v2";

export function SettingsDialog({ isOpen, onClose }: SettingsDialogProps) {
   const [token, setToken] = useState("");
   const [hasCustomToken, setHasCustomToken] = useState(false);
   const [isLoading, setIsLoading] = useState(false);
   const [error, setError] = useState("");

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
            logError(requestError, "Failed to load settings.");
            if (isActive) {
               setError("Settings could not be loaded.");
            }
         });

      return () => {
         isActive = false;
      };
   }, [isOpen]);

   if (!isOpen) {
      return null;
   }

   const closeSettings = () => {
      setError("");
      setToken("");
      onClose();
   };

   const handleSubmit = async (event: SyntheticEvent<HTMLFormElement>) => {
      event.preventDefault();
      const nextToken = token.trim();
      if (!nextToken) {
         setError("Enter a bearer token first.");
         return;
      }

      setIsLoading(true);
      setError("");

      try {
         await saveOsirisToken(nextToken);
         reloadRosterData();
      } catch (requestError) {
         logError(requestError, "Failed to save Osiris token.");
         setError("Token could not be saved.");
         setIsLoading(false);
      }
   };

   const handleClear = async () => {
      setIsLoading(true);
      setError("");

      try {
         await clearOsirisToken();
         reloadRosterData();
      } catch (requestError) {
         logError(requestError, "Failed to remove Osiris token.");
         setError("Token could not be removed.");
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
                  <h2 id="settings-title">Osiris token</h2>
               </div>
               <button className="icon-button icon-button--ghost" type="button" aria-label="Close settings" onClick={closeSettings}>
                  <i className="fa-solid fa-xmark" />
               </button>
            </header>

            <form className="settings-dialog__form" onSubmit={(event) => void handleSubmit(event)}>
               <label className="settings-dialog__field">
                  <span>Bearer token</span>
                  <input
                     type="password"
                     value={token}
                     placeholder={hasCustomToken ? "Replace Custom Token" : "Bearer XXXXXXXXXXXXXXXXXXXXXXXXXXX"}
                     autoComplete="off"
                     spellCheck={false}
                     disabled={isLoading}
                     onChange={(event) => setToken(event.target.value)}
                  />
               </label>

               <p className="settings-dialog__status">{hasCustomToken ? "Roster requests are using your saved token." : "Roster requests are using the server default."}</p>
               {error ? <p className="settings-dialog__error">{error}</p> : null}

               <div className="settings-dialog__actions">
                  <button className="settings-dialog__button settings-dialog__button--primary" type="submit" disabled={isLoading}>
                     Save
                  </button>
                  <button className="settings-dialog__button" type="button" disabled={isLoading || !hasCustomToken} onClick={() => void handleClear()}>
                     Use default
                  </button>
               </div>
            </form>
         </section>
      </div>
   );
}

function reloadRosterData() {
   window.localStorage.removeItem(CURRENT_WEEK_CACHE_KEY);
   window.location.reload();
}
