import { useCallback, useState } from "react";
import { OsirisTokenSettingsError } from "../api/settings";
import { getSessionSnapshot, saveSessionToken } from "../lib/sessionStore";
import { notifyError } from "../lib/notyf";
import type { OsirisTokenValidationStatus } from "../types/osirisToken";
import type { WeekLoadError } from "../lib/weekLoadError";

type Validation =
   | { phase: "idle" }
   | { phase: "saving" }
   | { phase: "waiting"; revision: number }
   | { phase: "failed"; reason: "rejected" | "save-unavailable"; revision: number };

export function useTokenValidation(hasToken: boolean, error: WeekLoadError | null, lastSuccessfulRevision: number | null, currentRevision: number) {
   const [state, setState] = useState<Validation>({ phase: "idle" });
   // The auth-error settings refresh clears the week error, so the expiry is
   // remembered here until the next token submit. Stored the React way: during
   // render, guarded by the previously seen flag.
   const [expiredToken, setExpiredToken] = useState(false);
   const [seenSavedTokenExpired, setSeenSavedTokenExpired] = useState(false);
   if ((error?.savedTokenExpired ?? false) !== seenSavedTokenExpired) {
      setSeenSavedTokenExpired(error?.savedTokenExpired === true);
      if (error?.savedTokenExpired) setExpiredToken(true);
   }
   const pending = state.phase === "waiting" && state.revision === currentRevision && state.revision !== lastSuccessfulRevision;
   const successfulKey = state.phase === "waiting" && state.revision === lastSuccessfulRevision ? state.revision : null;
   const status: OsirisTokenValidationStatus =
      state.phase === "saving"
         ? "checking"
         : state.phase === "failed" && state.revision === currentRevision
           ? state.reason
           : error?.savedTokenExpired || (expiredToken && !hasToken)
             ? "expired"
             : error?.isAuthRelated
               ? "rejected"
               : pending
                 ? error
                    ? "unavailable"
                    : "checking"
                 : hasToken
                   ? "ready"
                   : "required";
   const submit = useCallback(async (token: string) => {
      if (!token.trim()) return;
      setExpiredToken(false);
      setState({ phase: "saving" });
      try {
         await saveSessionToken(token.trim());
         setState({ phase: "waiting", revision: getSessionSnapshot().revision });
      } catch (error) {
         setState({
            phase: "failed",
            revision: getSessionSnapshot().revision,
            reason: error instanceof OsirisTokenSettingsError && error.isTokenRejected ? "rejected" : "save-unavailable",
         });
         notifyError(error, "Failed to save Osiris token.");
      }
   }, []);
   const clearFailure = useCallback(() => setState((current) => (current.phase === "failed" ? { phase: "idle" } : current)), []);
   return { status, pending, successfulKey, submit, clearFailure };
}
