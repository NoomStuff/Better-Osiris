import type { Lesson, LessonStatus, RosterResponse } from "../../shared/roster.js";
import { ApiError } from "./errors.js";
import type { OsirisRosterEntry, OsirisRosterResponse, OsirisWeek } from "./osirisClient.js";

function splitSubject(rawSubject: string) {
   const parts = rawSubject
      .split(" - ")
      .map((part) => part.trim())
      .filter(Boolean);

   const title = parts[0] ?? rawSubject;
   const subject = parts[1] ?? title;
   const description = parts.slice(2).join(" - ") || subject;

   if (parts.length >= 3) {
      return {
         title,
         subject,
         description,
      };
   }

   if (parts.length === 2) {
      return {
         title,
         subject,
         description: subject,
      };
   }

   return {
      title,
      subject,
      description,
   };
}

const AMSTERDAM_DATE_FORMATTER = new Intl.DateTimeFormat("en-CA", {
   timeZone: "Europe/Amsterdam",
   year: "numeric",
   month: "2-digit",
   day: "2-digit",
});

function getDatePart(dateIso: string) {
   const dateOnlyMatch = /^\d{4}-\d{2}-\d{2}$/.exec(dateIso);
   if (dateOnlyMatch) {
      return dateIso;
   }

   const parsed = new Date(dateIso);
   if (!Number.isNaN(parsed.getTime())) {
      return AMSTERDAM_DATE_FORMATTER.format(parsed);
   }

   const match = /\d{4}-\d{2}-\d{2}/.exec(dateIso);
   return match ? match[0] : dateIso;
}

function toLocalDateTime(dayIso: string, timeValue: string) {
   const dateOnly = getDatePart(dayIso);
   const [hoursText = "0", minutesText = "0"] = timeValue.split(":");
   const hours = String(Number(hoursText)).padStart(2, "0");
   const minutes = String(Number(minutesText)).padStart(2, "0");
   return `${dateOnly}T${hours}:${minutes}:00`;
}

function toLocalDateOnly(dayIso: string) {
   return getDatePart(dayIso);
}

function normalizeLesson(item: OsirisRosterEntry): Lesson {
   const parsed = splitSubject(item.onderwerp);
   const status: LessonStatus = resolveLessonStatus(item);

   const start = toLocalDateTime(item.datum, item.tijd_vanaf);
   const end = toLocalDateTime(item.datum, item.tijd_tm);
   if (end <= start) {
      throw new ApiError(`OSIRIS lesson ${item.id_rooster} has an invalid time range.`, {
         code: "UPSTREAM_INVALID_RESPONSE",
         status: 502,
      });
   }

   return {
      id: item.id_rooster,
      title: parsed.title,
      subject: parsed.subject,
      start,
      end,
      teacher: item.docenten.map((teacher) => teacher.naam).join(", ") || "Unknown",
      room: item.locatie || "Unknown",
      location: item.locatie_adres || item.locatie || "Unknown",
      description: item.subonderwerp.trim() || parsed.description,
      status,
   };
}

function resolveLessonStatus(item: OsirisRosterEntry): LessonStatus {
   const statusHints = ["status", "roosterstatus", "status_omschrijving", "statusomschrijving"];
   const itemRecord = item as unknown as Record<string, unknown>;
   const normalizedHints = statusHints
      .map((key) => itemRecord[key])
      .filter((value): value is string => typeof value === "string")
      .map((value) => value.toLocaleLowerCase());

   if (normalizedHints.some((hint) => hint.includes("cancel") || hint.includes("vervallen") || hint.includes("geannuleerd"))) {
      return "cancelled";
   }

   if (normalizedHints.some((hint) => hint.includes("change") || hint.includes("wijzig"))) {
      return "changed";
   }

   return "scheduled";
}

function normalizeRosterWeekItem(week: OsirisWeek, requestedOffset: number): RosterResponse {
   return {
      week: {
         offset: requestedOffset,
         number: week.week,
         start: toLocalDateOnly(week.startdatum),
         end: toLocalDateOnly(week.einddatum),
      },
      lessons: week.dagen.flatMap((day) => day.rooster.map(normalizeLesson)),
   };
}

export function normalizeRosterWeeksResponse(rawData: OsirisRosterResponse, requestedOffset: number): RosterResponse[] {
   if (!rawData.items.length) {
      throw new Error("OSIRIS roster response did not include week items.");
   }

   return rawData.items.map((week, index) => normalizeRosterWeekItem(week, requestedOffset + index));
}
