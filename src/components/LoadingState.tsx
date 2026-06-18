import "./LoadingState.css";

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

export function LoadingState({ message }: LoadingStateProps) {
   return (
      <div className="loading-state">
         <span className="spinner" />
         <p>{message}</p>
      </div>
   );
}

export function ErrorState({ title, detail, log, retryCountdownMs, isRetrying }: ErrorStateProps) {
   const secondsUntilRetry = Math.ceil(retryCountdownMs / 1_000);
   const retryText = isRetrying
      ? "Retrying now..."
      : secondsUntilRetry > 0
        ? `Retrying in ${secondsUntilRetry}s.`
        : "Retrying soon.";

   return (
      <div className="loading-state loading-state--error" role="alert">
         <i className="fa-solid fa-triangle-exclamation loading-state__error-icon" aria-hidden="true" />
         <div className="loading-state__copy">
            <h2>{title}</h2>
            <p className="loading-state__detail">{detail}</p>
            <strong className="loading-state__retry">{retryText}</strong>
            <p className="loading-state__log">Error: {log}</p>
         </div>
      </div>
   );
}
