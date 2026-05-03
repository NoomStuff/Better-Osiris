import type { Lesson, LessonStatus, RosterResponse } from "../../src/types/roster";
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

function toIsoDateTime(dayIso: string, timeValue: string) {
   const day = new Date(dayIso);
   const [hoursText = "0", minutesText = "0"] = timeValue.split(":");
   const hours = Number(hoursText);
   const minutes = Number(minutesText);
   day.setUTCHours(hours, minutes, 0, 0);
   return day.toISOString();
}

function normalizeLesson(item: OsirisRosterEntry): Lesson {
   const parsed = splitSubject(item.onderwerp);
   const status: LessonStatus = item.actueel === "J" ? "changed" : "scheduled";

   return {
      id: item.id_rooster,
      title: parsed.title,
      subject: parsed.subject,
      start: toIsoDateTime(item.datum, item.tijd_vanaf),
      end: toIsoDateTime(item.datum, item.tijd_tm),
      teacher: item.docenten.map((teacher) => teacher.naam).join(", ") || "Unknown",
      room: item.locatie || "Unknown",
      location: item.locatie_adres || item.locatie || "Unknown",
      description: item.subonderwerp || parsed.description,
      status,
   };
}

function normalizeRosterWeekItem(week: OsirisWeek, requestedOffset: number): RosterResponse {
   return {
      week: {
         offset: requestedOffset,
         number: week.week,
         start: week.startdatum,
         end: week.einddatum,
      },
      lessons: week.dagen.flatMap((day) => day.rooster.map(normalizeLesson)),
      source: {
         mode: "osiris",
         note: "Using live OSIRIS roster data.",
      },
   };
}

export function normalizeRosterWeekResponse(rawData: OsirisRosterResponse, requestedOffset: number): RosterResponse {
   const week = rawData.items[0];
   if (!week) {
      throw new Error("OSIRIS roster response did not include a week item.");
   }

   return normalizeRosterWeekItem(week, requestedOffset);
}

export function normalizeRosterWeeksResponse(rawData: OsirisRosterResponse, requestedOffset: number): RosterResponse[] {
   if (!rawData.items.length) {
      throw new Error("OSIRIS roster response did not include week items.");
   }

   return rawData.items.map((week, index) => normalizeRosterWeekItem(week, requestedOffset + index));
}
