import { WeekRequestError } from "../api/weeks";

export interface WeekLoadError {
   title: string;
   detail: string;
   log: string;
   isAuthRelated: boolean;
   retryable: boolean;
}

export function toWeekLoadError(error: unknown): WeekLoadError {
   if (error instanceof WeekRequestError) {
      return {
         title: "Could not load your roster.",
         detail: "Osiris did not hand over the goods.",
         log: error.message,
         isAuthRelated: error.isAuthRelated,
         retryable: error.retryable,
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
