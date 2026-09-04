import type { ReactNode, SyntheticEvent } from "react";
import { OSIRIS_BEARER_TOKEN_HELP_URL } from "../lib/osirisTokenHelp";
import type { OsirisTokenValidationStatus } from "../types/osirisToken";
import "./LoadingState.css";

interface WeekOverlayStateProps {
   title: string;
   detail: string;
   icon?: string | undefined;
   spinning?: boolean;
   role?: "alert" | "status" | undefined;
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
   canRetry: boolean;
}

interface BearerTokenStateProps {
   token: string;
   status: Exclude<OsirisTokenValidationStatus, "ready">;
   onTokenChange: (token: string) => void;
   onSubmit: () => void;
}

export function WeekOverlayState({ title, detail, icon, spinning = false, role, children }: WeekOverlayStateProps) {
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
   return <WeekOverlayState title="Loading roster" detail={message} spinning role="status" />;
}

export function ErrorState({ title, detail, log, retryCountdownMs, isRetrying, canRetry }: ErrorStateProps) {
   const secondsUntilRetry = Math.ceil(retryCountdownMs / 1_000);
   const retryText = isRetrying ? "Retrying now..." : secondsUntilRetry > 0 ? `Retrying in ${secondsUntilRetry}s.` : "Retrying soon.";

   return (
      <WeekOverlayState title={title} detail={detail} icon="fa-solid fa-triangle-exclamation" role="alert">
         {canRetry ? <strong className="roster-overlay-state__retry">{retryText}</strong> : null}
         <details className="roster-overlay-state__log">
            <summary>Error log</summary>
            <p>Error: {log}</p>
         </details>
      </WeekOverlayState>
   );
}

export function BearerTokenState({ token, status, onTokenChange, onSubmit }: BearerTokenStateProps) {
   const isChecking = status === "checking";
   const canSave = token.trim().length > 0 && !isChecking;
   const content = {
      required: {
         title: "Bearer token required",
         detail: "Paste your OSIRIS bearer token to load the roster. You can change it any time from settings.",
      },
      checking: {
         title: "Checking bearer token",
         detail: "Waiting for OSIRIS to return your roster.",
      },
      rejected: {
         title: "Bearer token rejected",
         detail: "OSIRIS did not accept this token. Paste a fresh token and try again.",
      },
      unavailable: {
         title: "Could not check bearer token",
         detail: "OSIRIS is unavailable right now. The roster will retry automatically, or you can try another token.",
      },
   }[status];

   const handleSubmit = (event: SyntheticEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!canSave) {
         return;
      }

      onSubmit();
   };

   return (
      <WeekOverlayState
         title={content.title}
         detail={content.detail}
         icon={isChecking ? undefined : status === "required" ? "fa-solid fa-key" : "fa-solid fa-triangle-exclamation"}
         spinning={isChecking}
         role={isChecking ? "status" : status === "required" ? undefined : "alert"}
      >
         <form className="roster-overlay-state__form" onSubmit={handleSubmit}>
            <a className="roster-overlay-state__help-link" href={OSIRIS_BEARER_TOKEN_HELP_URL} target="_blank" rel="noreferrer">
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
                  disabled={isChecking}
                  onChange={(event) => onTokenChange(event.target.value)}
               />
               <button className="roster-overlay-state__button" type="submit" aria-label="Load roster" disabled={!canSave}>
                  <i className="fa-solid fa-arrow-right" aria-hidden="true" />
               </button>
            </div>
         </form>
      </WeekOverlayState>
   );
}
