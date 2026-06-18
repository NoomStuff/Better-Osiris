import { useEffect, useState } from "react";
import type { SyntheticEvent } from "react";
import { clearOsirisToken, fetchOsirisTokenSettings, saveOsirisToken } from "../api/settings";
import { notifyError, notifyWarning, notifySuccess } from "../lib/notyf";
import { IconButton } from "./IconButton";
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
                  <h2 id="settings-title">Osiris token</h2>
               </div>
               <IconButton icon="fa-solid fa-xmark" label="Close settings" variant="ghost" onClick={closeSettings} />
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

               <p className="settings-dialog__status">
                  {hasCustomToken ? "Roster requests are using your saved token." : "Roster requests are using the server default."}
               </p>

               <div className="settings-dialog__actions">
                  <button className="settings-dialog__button settings-dialog__button--primary" type="submit" disabled={isLoading}>
                     Save
                  </button>
                  <button className="settings-dialog__button" type="button" disabled={isLoading || !hasCustomToken} onClick={() => void handleClear()}>
                     Reset to default
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
