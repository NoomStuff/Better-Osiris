import type { Lesson, LessonStatus, RosterResponse } from "../../shared/roster.js";
import type { OsirisRosterEntry, OsirisRosterResponse, OsirisWeek } from "./osirisClient.js";

function splitSubject(rawSubject: string) {
   const parts = rawSubject
      .split(" - ")
      .map((part) => part.trim())
      .filter(Boolean);

   const title = parts[0] ?? rawSubject;
   const subject = parts[1] ?? title;
   const description = parts[2] ?? subject;

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

function parseLocalDate(dateIso: string) {
   const datePart = getDatePart(dateIso);
   const match = /^\d{4}-\d{2}-\d{2}$/.exec(datePart);
   if (match) {
      const [yearText, monthText, dayText] = datePart.split("-");
      const year = Number(yearText);
      const month = Number(monthText);
      const day = Number(dayText);
      return new Date(year, month - 1, day);
   }

   return new Date(dateIso);
}

function toLocalDateTime(dayIso: string, timeValue: string) {
   const dateOnly = getDatePart(dayIso);
   const [hoursText = "0", minutesText = "0"] = timeValue.split(":");
   const hours = String(Number(hoursText)).padStart(2, "0");
   const minutes = String(Number(minutesText)).padStart(2, "0");
   return `${dateOnly}T${hours}:${minutes}:00`;
}

function toLocalDateOnly(dayIso: string) {
   const day = parseLocalDate(getDatePart(dayIso));
   return AMSTERDAM_DATE_FORMATTER.format(day);
}

function normalizeLesson(item: OsirisRosterEntry): Lesson {
   const parsed = splitSubject(item.onderwerp);
   const status: LessonStatus = resolveLessonStatus(item);

   return {
      id: item.id_rooster,
      title: parsed.title,
      subject: parsed.subject,
      start: toLocalDateTime(item.datum, item.tijd_vanaf),
      end: toLocalDateTime(item.datum, item.tijd_tm),
      teacher: item.docenten.map((teacher) => teacher.naam).join(", ") || "Unknown",
      room: item.locatie || "Unknown",
      location: item.locatie_adres || item.locatie || "Unknown",
      description: item.subonderwerp || parsed.description,
      status,
   };
}

function resolveLessonStatus(item: OsirisRosterEntry): LessonStatus {
   const statusHints = ["status", "roosterstatus", "status_omschrijving", "statusomschrijving"];
   const itemRecord = item as unknown as Record<string, unknown>;
   const raw = statusHints.map((key) => itemRecord[key]).find((value) => typeof value === "string");
   const normalized = typeof raw === "string" ? raw.toLowerCase() : "";

   if (normalized.includes("cancel") || normalized.includes("vervallen") || normalized.includes("geannuleerd")) {
      return "cancelled";
   }

   if (normalized.includes("change") || normalized.includes("wijzig")) {
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
      source: {
         mode: "osiris",
         note: "Using live OSIRIS roster data.",
      },
   };
}

export function normalizeRosterWeeksResponse(rawData: OsirisRosterResponse, requestedOffset: number): RosterResponse[] {
   if (!rawData.items.length) {
      throw new Error("OSIRIS roster response did not include week items.");
   }

   return rawData.items.map((week, index) => normalizeRosterWeekItem(week, requestedOffset + index));
}
