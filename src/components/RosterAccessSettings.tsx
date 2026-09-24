import { useCallback, useEffect, useState, type SyntheticEvent } from "react";
import { useOsirisTokenSettings } from "../hooks/useOsirisTokenSettings";
import { clearSessionToken } from "../lib/sessionStore";
import { notifyError, notifySuccess, notifyWarning } from "../lib/notyf";
import { OSIRIS_BEARER_TOKEN_HELP_URL } from "../lib/osirisTokenHelp";
import type { OsirisTokenValidationStatus } from "../types/osirisToken";
import { Button } from "./Button";
import { ConfirmDialog } from "./ConfirmDialog";

interface RosterAccessSettingsProps {
   onTokenDraftChange: () => void;
   onSaveToken: (token: string) => Promise<void>;
   successfulTokenValidationKey: number | null;
   tokenValidationStatus: OsirisTokenValidationStatus;
}

/** The roster access section owns its own token settings store; token validation stays with the app overlay. */
export function RosterAccessSettings({ onTokenDraftChange, onSaveToken, successfulTokenValidationKey, tokenValidationStatus }: RosterAccessSettingsProps) {
   const { isMutating: isTokenLoading, settings: tokenSettings } = useOsirisTokenSettings();
   const [token, setToken] = useState("");
   const [isRemoveConfirmOpen, setIsRemoveConfirmOpen] = useState(false);

   const hasCustomToken = tokenSettings?.hasCustomToken === true;
   const hasBearerToken = tokenSettings?.hasBearerToken === true;
   const isCheckingToken = isTokenLoading || tokenValidationStatus === "checking";
   const canSaveToken = token.trim().length > 0 && !isCheckingToken;
   const tokenAccessDetail =
      tokenValidationStatus === "checking"
         ? "Checking whether OSIRIS accepts this token."
         : tokenValidationStatus === "rejected"
           ? "OSIRIS rejected this token. Paste a fresh one and try again."
           : tokenValidationStatus === "save-unavailable"
             ? "The token was not saved. Try again with the same token."
             : tokenValidationStatus === "unavailable"
               ? "OSIRIS is unavailable. The roster will retry automatically."
               : hasCustomToken || hasBearerToken
                 ? "Roster requests are using your saved bearer token."
                 : "No bearer token is set.";

   useEffect(() => {
      if (successfulTokenValidationKey === null) {
         return;
      }

      const resetTimerId = window.setTimeout(() => setToken(""), 0);
      return () => window.clearTimeout(resetTimerId);
   }, [successfulTokenValidationKey]);

   const handleSubmit = async (event: SyntheticEvent<HTMLFormElement>) => {
      event.preventDefault();
      const nextToken = token.trim();
      if (!nextToken) {
         notifyWarning("Enter a bearer token first.");
         return;
      }

      await onSaveToken(nextToken);
   };

   const handleClear = useCallback(async () => {
      try {
         await clearSessionToken();
         setIsRemoveConfirmOpen(false);
         notifySuccess("Osiris token removed successfully.");
      } catch (requestError) {
         notifyError(requestError, "Failed to remove Osiris token.");
      }
   }, []);

   const closeRemoveConfirm = useCallback(() => setIsRemoveConfirmOpen(false), []);
   const confirmClear = useCallback(() => void handleClear(), [handleClear]);

   return (
      <>
         <section className="settings-section" aria-labelledby="token-settings-title">
            <div className="settings-section__header">
               <i className="settings-section__icon fa-solid fa-key" aria-hidden="true" />
               <div className="settings-section__copy">
                  <h3 id="token-settings-title">Roster access</h3>
                  <p>{tokenAccessDetail}</p>
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
                     disabled={isCheckingToken}
                     onChange={(event) => {
                        setToken(event.target.value);
                        onTokenDraftChange();
                     }}
                  />
               </label>

               <div className="settings-dialog__actions">
                  <Button variant="primary" type="submit" disabled={!canSaveToken}>
                     {isCheckingToken ? "Verifying..." : "Save"}
                  </Button>
                  <Button
                     variant="danger"
                     disabled={isCheckingToken || !hasCustomToken}
                     onClick={(event) => {
                        event.currentTarget.focus({ preventScroll: true });
                        setIsRemoveConfirmOpen(true);
                     }}
                  >
                     Remove
                  </Button>
               </div>
            </form>
         </section>

         <ConfirmDialog
            isOpen={isRemoveConfirmOpen}
            title="Remove bearer token?"
            detail="This will remove the saved bearer token and reload the roster."
            confirmLabel="Remove token"
            variant="danger"
            isConfirming={isTokenLoading}
            onCancel={closeRemoveConfirm}
            onConfirm={confirmClear}
         />
      </>
   );
}
