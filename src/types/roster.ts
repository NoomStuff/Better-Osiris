import type { Lesson } from "../../shared/roster";

export type { Lesson, LessonSnapshot, LessonStatus, RosterBatchResponse, RosterResponse, RosterWeek } from "../../shared/roster";

export type ViewMode = "agenda" | "grid";
export type GridZoom = "hour" | "half" | "quarter";

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
