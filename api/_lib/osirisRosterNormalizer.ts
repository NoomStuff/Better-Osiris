import type { Class, ClassStatus, Week } from "../../shared/weeks.js";
import { getZoneDateFormatter } from "../../shared/timeZone.js";
import { ApiError } from "./errors.js";
import { getRosterTimeZone } from "./osirisConfig.js";
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

function getDatePart(dateIso: string) {
   const dateOnlyMatch = /^\d{4}-\d{2}-\d{2}$/.exec(dateIso);
   if (dateOnlyMatch) {
      return dateIso;
   }

   const parsed = new Date(dateIso);
   if (!Number.isNaN(parsed.getTime())) {
      // Upstream sent a full timestamp: read its date part in the roster time zone, never in the server's local zone.
      return getZoneDateFormatter(getRosterTimeZone()).format(parsed);
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

function normalizeClass(item: OsirisRosterEntry): Class {
   const parsed = splitSubject(item.onderwerp);
   const status: ClassStatus = resolveClassStatus(item);

   const start = toLocalDateTime(item.datum, item.tijd_vanaf);
   const end = toLocalDateTime(item.datum, item.tijd_tm);
   if (end <= start) {
      throw new ApiError(`OSIRIS schoolClass ${item.id_rooster} has an invalid time range.`, {
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

function resolveClassStatus(item: OsirisRosterEntry): ClassStatus {
   const statusHints = ["status", "roosterstatus", "status_omschrijving", "statusomschrijving"];
   const itemRecord = item as unknown as Record<string, unknown>;
   const normalizedHints = statusHints
      .map((key) => itemRecord[key])
      .filter((value): value is string => typeof value === "string")
      .map((value) => value.toLocaleLowerCase());

   if (normalizedHints.some((hint) => hint.includes("cancel") || hint.includes("vervallen") || hint.includes("geannuleerd"))) {
      return "cancelled";
   }

   // "changed" is a client-side diff state. Upstream wording is not stable enough to
   // manufacture that state without the previous class snapshot the UI requires.
   return "scheduled";
}

function normalizeRosterWeekItem(week: OsirisWeek, requestedOffset: number): Week {
   return {
      week: {
         offset: requestedOffset,
         number: week.week,
         start: toLocalDateOnly(week.startdatum),
         end: toLocalDateOnly(week.einddatum),
      },
      classes: week.dagen.flatMap((day) => day.rooster.map(normalizeClass)),
   };
}

export function normalizeWeeksResponse(rawData: OsirisRosterResponse, requestedOffset: number, requestedLimit = rawData.items.length): Week[] {
   if (rawData.offset !== requestedOffset || rawData.items.length !== requestedLimit) {
      throw new ApiError("OSIRIS returned an incomplete or mismatched week batch.", {
         code: "UPSTREAM_INVALID_RESPONSE",
         status: 502,
      });
   }

   return rawData.items.map((week, index) => normalizeRosterWeekItem(week, requestedOffset + index));
}
