import type { ReactNode, SyntheticEvent } from "react";
import { OSIRIS_BEARER_TOKEN_VIDEO_URL } from "../lib/osirisTokenHelp";
import "./LoadingState.css";

interface RosterOverlayStateProps {
   title: string;
   detail: string;
   icon?: string;
   spinning?: boolean;
   role?: "alert" | "status";
   children?: ReactNode;
}

interface LoadingStateProps {
   message: string;
}

interface ErrorStateProps {
   title: string;
   detail: string;
   log: string;
   retryCountdownMs: number;
   isRetrying: boolean;
}

interface BearerTokenStateProps {
   token: string;
   isSaving: boolean;
   onTokenChange: (token: string) => void;
   onSubmit: () => void;
}

export function RosterOverlayState({ title, detail, icon, spinning = false, role, children }: RosterOverlayStateProps) {
   return (
      <div className="roster-overlay-state" role={role}>
         {spinning ? <span className="spinner roster-overlay-state__spinner" /> : null}
         {icon ? <i className={icon} aria-hidden="true" /> : null}
         <h3>{title}</h3>
         <p>{detail}</p>
         {children}
      </div>
   );
}

export function LoadingState({ message }: LoadingStateProps) {
   return <RosterOverlayState title="Loading roster" detail={message} spinning role="status" />;
}

export function ErrorState({ title, detail, log, retryCountdownMs, isRetrying }: ErrorStateProps) {
   const secondsUntilRetry = Math.ceil(retryCountdownMs / 1_000);
   const retryText = isRetrying ? "Retrying now..." : secondsUntilRetry > 0 ? `Retrying in ${secondsUntilRetry}s.` : "Retrying soon.";

   return (
      <RosterOverlayState title={title} detail={detail} icon="fa-solid fa-triangle-exclamation" role="alert">
         <strong className="roster-overlay-state__retry">{retryText}</strong>
         <p className="roster-overlay-state__log">Error: {log}</p>
      </RosterOverlayState>
   );
}

export function BearerTokenState({ token, isSaving, onTokenChange, onSubmit }: BearerTokenStateProps) {
   const canSave = token.trim().length > 0 && !isSaving;

   const handleSubmit = (event: SyntheticEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!canSave) {
         return;
      }

      onSubmit();
   };

   return (
      <RosterOverlayState
         title="Bearer token required"
         detail="Paste your OSIRIS bearer token to load the roster. You can change this any time from settings."
         icon="fa-solid fa-key"
         role="alert"
      >
         <form className="roster-overlay-state__form" onSubmit={handleSubmit}>
            <a className="roster-overlay-state__help-link" href={OSIRIS_BEARER_TOKEN_VIDEO_URL} target="_blank" rel="noreferrer">
               Learn how to get your bearer token
            </a>
            <div className="roster-overlay-state__token-row">
               <input
                  type="password"
                  value={token}
                  aria-label="Bearer token"
                  placeholder="Bearer XXXXXXXXXXXXXXXXXXXXXXXXXXX"
                  autoComplete="off"
                  spellCheck={false}
                  disabled={isSaving}
                  onChange={(event) => onTokenChange(event.target.value)}
               />
               <button className="roster-overlay-state__button" type="submit" aria-label="Save token" disabled={!canSave}>
                  <i className="fa-solid fa-check" aria-hidden="true" />
               </button>
            </div>
         </form>
      </RosterOverlayState>
   );
}
