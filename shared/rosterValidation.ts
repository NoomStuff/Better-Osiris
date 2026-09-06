import type { Class, ClassSnapshot, ClassStatus, OsirisTokenSettings, RosterConfig, WeekBatch, Week, WeekMeta } from "./weeks.js";
import { isValidTimeZone, resolveCanonicalTimeZone } from "./timeZone.js";
import { isoWeekNumber, shiftCalendarDate } from "./calendar.js";

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
   const hasBearerToken = readBoolean(record["hasBearerToken"], "hasBearerToken");
   const contextId = record["contextId"];
   if (hasBearerToken ? typeof contextId !== "string" || !contextId : contextId !== null) {
      throw invalid("contextId", "a credential context matching token availability");
   }
   return {
      hasCustomToken: readBoolean(record["hasCustomToken"], "hasCustomToken"),
      hasBearerToken,
      contextId: contextId as string | null,
   };
}

export function parseWeekBatch(value: unknown): WeekBatch {
   const record = readRecord(value, "roster response");
   const offset = readInteger(record["offset"], "offset");
   const limit = readInteger(record["limit"], "limit");
   const weeks = readArray(record["weeks"], "weeks").map((week, index) => parseWeek(week, `weeks[${index}]`));
   if (limit < 1 || limit > 5 || weeks.length !== limit) {
      throw invalid("weeks", `an array containing exactly ${limit} weeks`);
   }
   weeks.forEach((week, index) => {
      if (week.week.offset !== offset + index) {
         throw invalid(`weeks[${index}].week.offset`, `${offset + index}`);
      }
      const first = weeks[0];
      if (first && week.week.start !== shiftCalendarDate(first.week.start, index * 7)) {
         throw invalid(`weeks[${index}].week.start`, "consecutive calendar weeks");
      }
   });
   const ids = weeks.flatMap((week) => week.classes.map((schoolClass) => schoolClass.id));
   if (new Set(ids).size !== ids.length) throw invalid("classes", "unique IDs across the batch");
   const contextId = readString(record["contextId"], "contextId");
   if (!contextId) throw invalid("contextId", "a nonempty credential context");
   const fetchedAt = readInteger(record["fetchedAt"], "fetchedAt");
   if (fetchedAt <= 0) throw invalid("fetchedAt", "a positive timestamp");

   return {
      offset,
      limit,
      weeks,
      timeZone: readTimeZone(record["timeZone"], "roster response"),
      contextId,
      fetchedAt,
   };
}

export function parseRosterConfig(value: unknown): RosterConfig {
   const record = readRecord(value, "roster config response");
   return {
      timeZone: readTimeZone(record["timeZone"], "roster config response"),
   };
}

function readTimeZone(value: unknown, path: string) {
   const timeZone = readString(value, `${path}.timeZone`);
   if (!isValidTimeZone(timeZone)) {
      throw invalid(`${path}.timeZone`, "a valid IANA time zone");
   }
   return resolveCanonicalTimeZone(timeZone);
}

export function parseWeek(value: unknown, path = "roster response"): Week {
   const record = readRecord(value, path);
   const parsed = {
      week: parseWeekMeta(record["week"], `${path}.week`),
      classes: readArray(record["classes"], `${path}.classes`).map((schoolClass, index) => parseClass(schoolClass, `${path}.classes[${index}]`)),
   };
   const ids = new Set<string>();
   parsed.classes.forEach((schoolClass) => {
      if (!schoolClass.id || ids.has(schoolClass.id)) throw invalid(`${path}.classes`, "unique nonempty class IDs");
      ids.add(schoolClass.id);
      const day = schoolClass.start.slice(0, 10);
      if (day < parsed.week.start || day > parsed.week.end || schoolClass.end.slice(0, 10) !== day) {
         throw invalid(`${path}.classes`, "classes within their enclosing week and calendar day");
      }
   });
   return parsed;
}

function parseWeekMeta(value: unknown, path: string): WeekMeta {
   const record = readRecord(value, path);
   const meta = {
      offset: readInteger(record["offset"], `${path}.offset`),
      number: readInteger(record["number"], `${path}.number`),
      start: readIsoDate(record["start"], `${path}.start`),
      end: readIsoDate(record["end"], `${path}.end`),
   };
   if (new Date(`${meta.start}T00:00:00Z`).getUTCDay() !== 1 || meta.end !== shiftCalendarDate(meta.start, 6) || meta.number !== isoWeekNumber(meta.start)) {
      throw invalid(path, "a Monday-to-Sunday ISO week with its matching week number");
   }
   return meta;
}

export function parseClass(value: unknown, path = "schoolClass"): Class {
   const record = readRecord(value, path);
   const previous = record["previous"];
   const status = readClassStatus(record["status"], `${path}.status`);
   const schoolClass = parseClassSnapshot({ ...record, status: status === "cancelled" ? "cancelled" : "scheduled" }, path);
   if (status === "changed") {
      return { ...schoolClass, status, previous: parseClassSnapshot(readRecord(previous, `${path}.previous`), `${path}.previous`) };
   }
   if (status === "cancelled") {
      return {
         ...schoolClass,
         status,
         ...(previous === undefined ? {} : { previous: parseClassSnapshot(readRecord(previous, `${path}.previous`), `${path}.previous`) }),
      };
   }
   if (previous !== undefined) throw invalid(`${path}.previous`, "absent for scheduled and added classes");
   return { ...schoolClass, status };
}

function parseClassSnapshot(record: Record<string, unknown>, path: string): ClassSnapshot {
   const snapshot: ClassSnapshot = {
      id: readString(record["id"], `${path}.id`),
      title: readString(record["title"], `${path}.title`),
      subject: readString(record["subject"], `${path}.subject`),
      start: readLocalDateTime(record["start"], `${path}.start`),
      end: readLocalDateTime(record["end"], `${path}.end`),
      teacher: readString(record["teacher"], `${path}.teacher`),
      room: readString(record["room"], `${path}.room`),
      location: readString(record["location"], `${path}.location`),
      description: readString(record["description"], `${path}.description`),
      status: readSourceStatus(record["status"], `${path}.status`),
   };
   if (snapshot.end <= snapshot.start) {
      throw invalid(path, "a schoolClass with an end after its start");
   }
   return snapshot;
}

function readClassStatus(value: unknown, path: string): ClassStatus {
   if (value === "scheduled" || value === "added" || value === "changed" || value === "cancelled") {
      return value;
   }
   throw invalid(path, "a known schoolClass status");
}

function readSourceStatus(value: unknown, path: string): "scheduled" | "cancelled" {
   if (value === "scheduled" || value === "cancelled") return value;
   throw invalid(path, "an upstream class status");
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
