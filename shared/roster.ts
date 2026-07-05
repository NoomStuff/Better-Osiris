export const MIN_WEEK_OFFSET = -1;
export const MIN_OSIRIS_WEEK_OFFSET = 0;
export const MAX_WEEK_OFFSET = 50;
export const MAX_WEEK_LIMIT = 5;

export interface OsirisTokenSettings {
   hasCustomToken: boolean;
   hasBearerToken: boolean;
}

export type LessonStatus = "scheduled" | "changed" | "cancelled";

export interface LessonSnapshot {
   id: string;
   title: string;
   subject: string;
   start: string;
   end: string;
   teacher: string;
   room: string;
   location: string;
   description: string;
   status: LessonStatus;
}

export interface Lesson {
   id: string;
   title: string;
   subject: string;
   start: string;
   end: string;
   teacher: string;
   room: string;
   location: string;
   description: string;
   status: LessonStatus;
   previous?: LessonSnapshot;
}

export interface RosterWeek {
   offset: number;
   number: number;
   start: string;
   end: string;
}

export interface RosterSource {
   mode: string;
   note: string;
}

export interface RosterResponse {
   week: RosterWeek;
   lessons: Lesson[];
   source: RosterSource;
}

export interface RosterBatchResponse {
   weeks: RosterResponse[];
   offset: number;
   limit: number;
   hasMore: boolean;
}
