import { ApiError } from "./errors.js";
import type { OsirisDay, OsirisRosterEntry, OsirisRosterResponse, OsirisTeacher, OsirisWeek } from "./osirisClient.js";

export function parseOsirisRosterResponse(value: unknown): OsirisRosterResponse {
   const record = readRecord(value, "response");
   return {
      items: readArray(record["items"], "items").map((item, index) => parseWeek(item, `items[${index}]`)),
      hasMore: readBoolean(record["hasMore"], "hasMore"),
      limit: readInteger(record["limit"], "limit"),
      offset: readInteger(record["offset"], "offset"),
      count: readInteger(record["count"], "count"),
      source: "per_week",
   };
}

function parseWeek(value: unknown, path: string): OsirisWeek {
   const record = readRecord(value, path);
   return {
      jaar: readInteger(record["jaar"], `${path}.jaar`),
      week: readInteger(record["week"], `${path}.week`),
      startdatum: readDate(record["startdatum"], `${path}.startdatum`),
      einddatum: readDate(record["einddatum"], `${path}.einddatum`),
      dagen: readArray(record["dagen"], `${path}.dagen`).map((day, index) => parseDay(day, `${path}.dagen[${index}]`)),
   };
}

function parseDay(value: unknown, path: string): OsirisDay {
   const record = readRecord(value, path);
   return {
      datum: readDate(record["datum"], `${path}.datum`),
      rooster: readArray(record["rooster"], `${path}.rooster`).map((entry, index) => parseEntry(entry, `${path}.rooster[${index}]`)),
   };
}

function parseEntry(value: unknown, path: string): OsirisRosterEntry {
   const record = readRecord(value, path);
   const actueel = readString(record["actueel"], `${path}.actueel`);
   if (actueel !== "J" && actueel !== "N") {
      throw invalidResponse(`${path}.actueel must be "J" or "N".`);
   }

   return {
      id_rooster: readString(record["id_rooster"], `${path}.id_rooster`),
      datum: readDate(record["datum"], `${path}.datum`),
      onderwerp: readString(record["onderwerp"], `${path}.onderwerp`),
      subonderwerp: readString(record["subonderwerp"], `${path}.subonderwerp`),
      tijd_vanaf: readTime(record["tijd_vanaf"], `${path}.tijd_vanaf`),
      tijd_tm: readTime(record["tijd_tm"], `${path}.tijd_tm`),
      locatie: readString(record["locatie"], `${path}.locatie`),
      locatie_adres: readString(record["locatie_adres"], `${path}.locatie_adres`),
      docenten: readArray(record["docenten"], `${path}.docenten`).map((teacher, index) => parseTeacher(teacher, `${path}.docenten[${index}]`)),
      actueel,
      ...readStatusHints(record),
   };
}

function parseTeacher(value: unknown, path: string): OsirisTeacher {
   const record = readRecord(value, path);
   return { naam: readString(record["naam"], `${path}.naam`) };
}

function readStatusHints(record: Record<string, unknown>) {
   return Object.fromEntries(
      ["status", "roosterstatus", "status_omschrijving", "statusomschrijving"]
         .map((key) => [key, record[key]] as const)
         .filter((entry): entry is readonly [string, string] => typeof entry[1] === "string")
   );
}

function readRecord(value: unknown, path: string): Record<string, unknown> {
   if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw invalidResponse(`${path} must be an object.`);
   }
   return value as Record<string, unknown>;
}

function readArray(value: unknown, path: string): unknown[] {
   if (!Array.isArray(value)) {
      throw invalidResponse(`${path} must be an array.`);
   }
   return value;
}

function readString(value: unknown, path: string) {
   if (typeof value !== "string") {
      throw invalidResponse(`${path} must be a string.`);
   }
   return value;
}

function readTime(value: unknown, path: string) {
   const time = readString(value, path);
   const match = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(time);
   const hours = Number(match?.[1]);
   const minutes = Number(match?.[2]);
   if (!match || hours > 23 || minutes > 59) {
      throw invalidResponse(`${path} must be a valid 24-hour time.`);
   }
   return time;
}

function readInteger(value: unknown, path: string) {
   if (typeof value !== "number" || !Number.isSafeInteger(value)) {
      throw invalidResponse(`${path} must be an integer.`);
   }
   return value;
}

function readDate(value: unknown, path: string) {
   const date = readString(value, path);
   const dateOnlyMatch = /^(\d{4}-\d{2}-\d{2})$/.exec(date);
   if (dateOnlyMatch) {
      const parsed = new Date(`${date}T00:00:00Z`);
      if (!Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date) {
         return date;
      }
   } else if (!Number.isNaN(Date.parse(date))) {
      return date;
   }

   throw invalidResponse(`${path} must be a valid date.`);
}

function readBoolean(value: unknown, path: string) {
   if (typeof value !== "boolean") {
      throw invalidResponse(`${path} must be a boolean.`);
   }
   return value;
}

function invalidResponse(message: string) {
   return new ApiError(`OSIRIS returned an invalid roster response: ${message}`, {
      code: "UPSTREAM_INVALID_RESPONSE",
      status: 502,
   });
}
