import type { RosterResponse } from "../src/types/roster";
import type { OsirisRosterEntry, OsirisRosterResponse } from "./osirisClient";

function splitSubject(rawSubject: string) {
   const parts = rawSubject
      .split(" - ")
      .map((part) => part.trim())
      .filter(Boolean);

   if (parts.length >= 3) {
      return {
         title: parts[0],
         subject: parts[1],
         description: parts[2],
      };
   }

   if (parts.length === 2) {
      return {
         title: parts[0],
         subject: parts[1],
         description: parts[1],
      };
   }

   return {
      title: rawSubject,
      subject: rawSubject,
      description: rawSubject,
   };
}

function toIsoDateTime(dayIso: string, timeValue: string) {
   const day = new Date(dayIso);
   const [hours, minutes] = timeValue.split(":").map(Number);
   day.setUTCHours(hours, minutes, 0, 0);
   return day.toISOString();
}

function normalizeLesson(item: OsirisRosterEntry) {
   const parsed = splitSubject(item.onderwerp);

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
      status: item.actueel === "J" ? "changed" : "scheduled",
   } as const;
}

export function normalizeRosterWeekResponse(rawData: OsirisRosterResponse, requestedOffset: number): RosterResponse {
   const week = rawData.items[0];
   if (!week) {
      throw new Error("OSIRIS roster response did not include a week item.");
   }

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
