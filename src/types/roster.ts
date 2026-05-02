export type ViewMode = "agenda" | "grid";
export type GridZoom = "hour" | "half" | "quarter";
export type LessonStatus = "scheduled" | "changed" | "cancelled";

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

export interface PositionedLesson extends Lesson {
   startDate: Date;
   endDate: Date;
   dayKey: string;
   overlapIndex: number;
   overlapCount: number;
}

export interface DayGroup {
   key: string;
   date: Date;
   lessons: PositionedLesson[];
}
