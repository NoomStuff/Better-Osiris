import { WeekRequestError } from "../api/weeks";

export interface WeekLoadError {
   title: string;
   detail: string;
   log: string;
   isAuthRelated: boolean;
   retryable: boolean;
   retryAfterMs?: number;
   /** OSIRIS rejected a token that had already loaded successfully, so it likely expired rather than was mistyped. */
   savedTokenExpired?: boolean;
}

export function toWeekLoadError(error: unknown, options: { hadSuccessfulLoad?: boolean } = {}): WeekLoadError {
   if (error instanceof WeekRequestError) {
      return {
         title: "Could not load your roster.",
         detail: "Osiris did not hand over the goods.",
         log: error.message,
         isAuthRelated: error.isAuthRelated,
         retryable: error.retryable,
         retryAfterMs: error.retryAfterMs,
         savedTokenExpired: error.code === "UPSTREAM_AUTH_FAILED" && options.hadSuccessfulLoad === true,
      };
   }

   return {
      title: "Could not load your roster.",
      detail: "The request crashed before it could finish.",
      log: error instanceof Error ? error.message : "Unknown roster fetch error.",
      isAuthRelated: false,
      retryable: error instanceof TypeError || (error instanceof DOMException && error.name === "TimeoutError"),
   };
}
