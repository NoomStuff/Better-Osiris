export const MIN_WEEK_OFFSET = -1;
export const MIN_OSIRIS_WEEK_OFFSET = 0;
export const MAX_WEEK_OFFSET = 50;
export const MAX_WEEK_LIMIT = 5;

export interface OsirisTokenSettings {
   hasCustomToken: boolean;
   hasBearerToken: boolean;
}

export type ClassStatus = "scheduled" | "changed" | "cancelled";

export interface ClassSnapshot {
   id: string;
   title: string;
   subject: string;
   start: string;
   end: string;
   teacher: string;
   room: string;
   location: string;
   description: string;
   status: ClassStatus;
}

export interface Class {
   id: string;
   title: string;
   subject: string;
   start: string;
   end: string;
   teacher: string;
   room: string;
   location: string;
   description: string;
   status: ClassStatus;
   previous?: ClassSnapshot;
}

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
}
