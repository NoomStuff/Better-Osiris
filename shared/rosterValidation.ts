import type { Lesson, LessonSnapshot, LessonStatus, OsirisTokenSettings, RosterBatchResponse, RosterResponse, RosterWeek } from "./roster.js";

export interface ApiErrorPayload {
   error: string;
   code: string;
   retryable: boolean;
}

export class ResponseValidationError extends Error {
   constructor(message: string) {
      super(message);
      this.name = "ResponseValidationError";
   }
}

export function parseApiErrorPayload(value: unknown): ApiErrorPayload | null {
   if (!isRecord(value) || typeof value["error"] !== "string") {
      return null;
   }
   return {
      error: value["error"],
      code: typeof value["code"] === "string" ? value["code"] : "UNKNOWN_ERROR",
      retryable: value["retryable"] === true,
   };
}

export function parseOsirisTokenSettings(value: unknown): OsirisTokenSettings {
   const record = readRecord(value, "settings response");
   return {
      hasCustomToken: readBoolean(record["hasCustomToken"], "hasCustomToken"),
      hasBearerToken: readBoolean(record["hasBearerToken"], "hasBearerToken"),
   };
}

export function parseRosterBatchResponse(value: unknown): RosterBatchResponse {
   const record = readRecord(value, "roster response");
   return {
      offset: readInteger(record["offset"], "offset"),
      limit: readInteger(record["limit"], "limit"),
      weeks: readArray(record["weeks"], "weeks").map((week, index) => parseRosterResponse(week, `weeks[${index}]`)),
   };
}

export function parseRosterResponse(value: unknown, path = "roster response"): RosterResponse {
   const record = readRecord(value, path);
   return {
      week: parseRosterWeek(record["week"], `${path}.week`),
      lessons: readArray(record["lessons"], `${path}.lessons`).map((lesson, index) => parseLesson(lesson, `${path}.lessons[${index}]`)),
   };
}

function parseRosterWeek(value: unknown, path: string): RosterWeek {
   const record = readRecord(value, path);
   return {
      offset: readInteger(record["offset"], `${path}.offset`),
      number: readInteger(record["number"], `${path}.number`),
      start: readIsoDate(record["start"], `${path}.start`),
      end: readIsoDate(record["end"], `${path}.end`),
   };
}

export function parseLesson(value: unknown, path = "lesson"): Lesson {
   const record = readRecord(value, path);
   const previous = record["previous"];
   const lesson = parseLessonSnapshot(record, path);
   return {
      ...lesson,
      ...(previous === undefined ? {} : { previous: parseLessonSnapshot(readRecord(previous, `${path}.previous`), `${path}.previous`) }),
   };
}

function parseLessonSnapshot(record: Record<string, unknown>, path: string): LessonSnapshot {
   const snapshot: LessonSnapshot = {
      id: readString(record["id"], `${path}.id`),
      title: readString(record["title"], `${path}.title`),
      subject: readString(record["subject"], `${path}.subject`),
      start: readLocalDateTime(record["start"], `${path}.start`),
      end: readLocalDateTime(record["end"], `${path}.end`),
      teacher: readString(record["teacher"], `${path}.teacher`),
      room: readString(record["room"], `${path}.room`),
      location: readString(record["location"], `${path}.location`),
      description: readString(record["description"], `${path}.description`),
      status: readLessonStatus(record["status"], `${path}.status`),
   };
   if (snapshot.end <= snapshot.start) {
      throw invalid(path, "a lesson with an end after its start");
   }
   return snapshot;
}

function readLessonStatus(value: unknown, path: string): LessonStatus {
   if (value === "scheduled" || value === "changed" || value === "cancelled") {
      return value;
   }
   throw invalid(path, "a known lesson status");
}

function readRecord(value: unknown, path: string): Record<string, unknown> {
   if (!isRecord(value)) {
      throw invalid(path, "an object");
   }
   return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
   return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readArray(value: unknown, path: string): unknown[] {
   if (!Array.isArray(value)) {
      throw invalid(path, "an array");
   }
   return value;
}

function readString(value: unknown, path: string) {
   if (typeof value !== "string") {
      throw invalid(path, "a string");
   }
   return value;
}

function readBoolean(value: unknown, path: string) {
   if (typeof value !== "boolean") {
      throw invalid(path, "a boolean");
   }
   return value;
}

function readInteger(value: unknown, path: string) {
   if (typeof value !== "number" || !Number.isSafeInteger(value)) {
      throw invalid(path, "an integer");
   }
   return value;
}

function readIsoDate(value: unknown, path: string) {
   const date = readString(value, path);
   const parsed = new Date(`${date}T00:00:00Z`);
   if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
      throw invalid(path, "a valid ISO date");
   }
   return date;
}

function readLocalDateTime(value: unknown, path: string) {
   const dateTime = readString(value, path);
   const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})$/.exec(dateTime);
   if (!match) {
      throw invalid(path, "a valid local ISO date-time");
   }

   readIsoDate(match[1], path);
   const hours = Number(match[2]);
   const minutes = Number(match[3]);
   const seconds = Number(match[4]);
   if (hours > 23 || minutes > 59 || seconds > 59) {
      throw invalid(path, "a valid local ISO date-time");
   }
   return dateTime;
}

function invalid(path: string, expected: string) {
   return new ResponseValidationError(`Invalid API response: ${path} must be ${expected}.`);
}
