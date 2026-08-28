import type { Class } from "../../shared/weeks";

export type { Class, ClassSnapshot, ClassStatus, WeekBatch, Week, WeekMeta } from "../../shared/weeks";

export type ViewMode = "agenda" | "grid";
export type GridZoom = "hour" | "half" | "quarter";

export interface PositionedClass extends Class {
   startDate: Date;
   endDate: Date;
   dayKey: string;
   overlapIndex: number;
   overlapCount: number;
}

export interface Day {
   key: string;
   date: Date;
   classes: PositionedClass[];
}
