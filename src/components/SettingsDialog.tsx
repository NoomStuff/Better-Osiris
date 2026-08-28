import { useCallback, useEffect, useRef, useState } from "react";
import type { SyntheticEvent } from "react";
import type { OsirisTokenSettings } from "../api/settings";
import type { DevLessonStatusPreviewMode } from "../lib/devRosterStatusPreview";
import { notifyError, notifySuccess, notifyWarning } from "../lib/notyf";
import { OSIRIS_BEARER_TOKEN_HELP_URL } from "../lib/osirisTokenHelp";
import { ConfirmDialog } from "./ConfirmDialog";
import { DevToolsSettings } from "./DevToolsSettings";
import { IconButton } from "./IconButton";
import { OverlayPanel, PANEL_CLOSE_MS } from "./OverlayPanel";
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
               <IconButton className="lesson-panel__close" icon="fa-solid fa-xmark" label="Close settings" tooltipPlacement="bottom" onClick={closeSettings} />
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
