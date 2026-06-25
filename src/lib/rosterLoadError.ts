import { RosterRequestError } from "../api/roster";

export interface RosterLoadError {
   title: string;
   detail: string;
   log: string;
   isAuthRelated: boolean;
}

export function toRosterLoadError(error: unknown): RosterLoadError {
   if (error instanceof RosterRequestError) {
      return {
         title: "Could not load your roster.",
         detail: "Osiris did not hand over the goods.",
         log: error.message,
         isAuthRelated: error.isAuthRelated,
      };
   }

   return {
      title: "Could not load your roster.",
      detail: "The roster request crashed before it could finish. Annoying, but I'll keep trying quietly.",
      log: error instanceof Error ? error.message : "Unknown roster fetch error.",
      isAuthRelated: false,
   };
}
