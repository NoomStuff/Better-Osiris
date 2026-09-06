export const MIN_WEEK_OFFSET = -1;
export const MIN_OSIRIS_WEEK_OFFSET = 0;
export const MAX_WEEK_OFFSET = 50;
export const MAX_WEEK_LIMIT = 5;

export interface OsirisTokenSettings {
   hasCustomToken: boolean;
   hasBearerToken: boolean;
   contextId: string | null;
}

export interface RosterConfig {
   timeZone: string;
}

export type SourceClassStatus = "scheduled" | "cancelled";
export type ClassStatus = SourceClassStatus | "added" | "changed";

export interface ClassDetails {
   id: string;
   title: string;
   subject: string;
   start: string;
   end: string;
   teacher: string;
   room: string;
   location: string;
   description: string;
}

export type ClassSnapshot = ClassDetails & { status: SourceClassStatus };
export type SourceClass = ClassSnapshot;
export type Class = ClassDetails &
   ({ status: "scheduled" | "added"; previous?: never } | { status: "cancelled"; previous?: ClassSnapshot } | { status: "changed"; previous: ClassSnapshot });

export interface WeekMeta {
   offset: number;
   number: number;
   start: string;
   end: string;
}

export interface Week {
   week: WeekMeta;
   classes: Class[];
}

export interface WeekBatch {
   weeks: Week[];
   offset: number;
   limit: number;
   /**
    * The IANA time zone the wall-clock times in this batch are expressed in. The server owns it;
    * the client must interpret every timezone-less class time against this zone.
    */
   timeZone: string;
   contextId: string;
   fetchedAt: number;
}
