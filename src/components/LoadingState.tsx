import type { ReactNode, SyntheticEvent } from "react";
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
   error: string;
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

export function BearerTokenState({ token, error, isSaving, onTokenChange, onSubmit }: BearerTokenStateProps) {
   const handleSubmit = (event: SyntheticEvent<HTMLFormElement>) => {
      event.preventDefault();
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
            <label className="roster-overlay-state__field">
               <span>Bearer token</span>
               <input
                  type="password"
                  value={token}
                  placeholder="Bearer XXXXXXXXXXXXXXXXXXXXXXXXXXX"
                  autoComplete="off"
                  spellCheck={false}
                  disabled={isSaving}
                  onChange={(event) => onTokenChange(event.target.value)}
               />
            </label>
            {error ? <p className="roster-overlay-state__error">{error}</p> : null}
            <button className="roster-overlay-state__button" type="submit" disabled={isSaving}>
               {isSaving ? "Saving..." : "Save token"}
            </button>
         </form>
      </RosterOverlayState>
   );
}
