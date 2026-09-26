import { retrySessionSettings } from "../lib/sessionStore";
import { getEmptyWeekMessage } from "../lib/flavor";
import type { Week, WeekMeta } from "../types/weeks";
import type { WeekLoadError } from "../lib/weekLoadError";
import type { OsirisTokenValidationStatus } from "../types/osirisToken";
import { BearerTokenState, ErrorState, LoadingState, WeekOverlayState } from "./LoadingState";
import { Button } from "./Button";

interface WeekContentStateProps {
   rosterTimeZone: {
      isKnown: boolean;
      isInitialLoading: boolean;
      configError: string | null;
      retry: () => void;
   };
   isTokenSettingsLoading: boolean;
   tokenSettingsLoadError: string | null;
   shouldShowTokenEntry: boolean;
   tokenValidationStatus: OsirisTokenValidationStatus;
   bearerTokenInput: string;
   onTokenChange: (token: string) => void;
   onTokenSubmit: () => void;
   loading: boolean;
   error: WeekLoadError | null;
   errorDetail: string;
   retryCountdownMs: number;
   retrying: boolean;
   refresh: () => void;
   weekNotReturned: boolean;
   displayedData: Week | null;
}

function EmptyWeekState({ week }: { week: WeekMeta }) {
   const message = getEmptyWeekMessage(week.start);

   return <WeekOverlayState icon={message.icon} title={message.title} detail={message.detail} />;
}

export function WeekContentState({
   rosterTimeZone,
   isTokenSettingsLoading,
   tokenSettingsLoadError,
   shouldShowTokenEntry,
   tokenValidationStatus,
   bearerTokenInput,
   onTokenChange,
   onTokenSubmit,
   loading,
   error,
   errorDetail,
   retryCountdownMs,
   retrying,
   refresh,
   weekNotReturned,
   displayedData,
}: WeekContentStateProps) {
   const hasDisplayedData = displayedData !== null;
   if (!rosterTimeZone.isKnown) {
      if (rosterTimeZone.isInitialLoading) {
         return <LoadingState message="Checking roster configuration." />;
      }
      return (
         <ErrorState
            title="Roster configuration unavailable"
            detail="The server did not declare which time zone the roster uses, so roster data cannot be interpreted safely."
            log={rosterTimeZone.configError ?? "The roster time zone was not declared."}
            retryCountdownMs={0}
            isRetrying={false}
            canRetry={false}
            onRetry={rosterTimeZone.retry}
         />
      );
   }
   if (isTokenSettingsLoading && !hasDisplayedData) {
      if (tokenSettingsLoadError) {
         return (
            <ErrorState
               title="Roster server unavailable"
               detail="Your bearer token settings could not be loaded. The app keeps retrying on its own."
               log={tokenSettingsLoadError}
               retryCountdownMs={0}
               isRetrying={false}
               canRetry={false}
               onRetry={retrySessionSettings}
            />
         );
      }
      return <LoadingState message="Checking bearer token." />;
   }
   if (shouldShowTokenEntry) {
      const tokenStatus = tokenValidationStatus === "ready" ? "required" : tokenValidationStatus;
      return <BearerTokenState token={bearerTokenInput} status={tokenStatus} onTokenChange={onTokenChange} onSubmit={onTokenSubmit} />;
   }
   if (loading) {
      return <LoadingState message="Fetching week data." />;
   }
   if (error && !hasDisplayedData) {
      return (
         <ErrorState
            title={error.title}
            detail={errorDetail}
            log={error.log}
            retryCountdownMs={retryCountdownMs}
            isRetrying={retrying}
            canRetry={error.retryable}
            onRetry={refresh}
         />
      );
   }
   if (weekNotReturned && !displayedData) {
      return (
         <WeekOverlayState
            title="Week not returned"
            detail="OSIRIS did not include this week in its latest response."
            icon="fa-solid fa-triangle-exclamation"
            role="status"
         >
            <Button onClick={refresh}>Try again</Button>
         </WeekOverlayState>
      );
   }
   if (displayedData?.classes.length === 0) {
      return <EmptyWeekState week={displayedData.week} />;
   }
   return null;
}
