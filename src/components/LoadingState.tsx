import type { ReactNode } from "react";
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
