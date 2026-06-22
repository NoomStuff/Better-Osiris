import { RosterRequestError } from "../api/roster";

export interface RosterLoadError {
   title: string;
   detail: string;
   log: string;
   isAuthRelated: boolean;
}

const ICALENDAR_UNAVAILABLE_BEFORE_PATTERN = /OSIRIS iCalendar does not expose roster data before ([^.]+)\./i;

function getICalendarUnavailableBeforeDate(error: RosterRequestError) {
   const match = ICALENDAR_UNAVAILABLE_BEFORE_PATTERN.exec(error.detail || error.message);
   return match?.[1]?.trim() ?? null;
}

export function toRosterLoadError(error: unknown): RosterLoadError {
   if (error instanceof RosterRequestError) {
      const unavailableBeforeDate = getICalendarUnavailableBeforeDate(error);
      return {
         title: "Could not load your roster.",
         detail: unavailableBeforeDate
            ? `Osiris did not hand over the goods. The calendar does not go back further than ${unavailableBeforeDate}.`
            : "Osiris did not hand over the goods.",
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
