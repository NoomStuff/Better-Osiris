import { getEnvValue } from "./env.js";
import crypto from "node:crypto";

const OSIRIS_ROSTER_URL = "https://mborijnland.osiris-student.nl/student/osiris/student/rooster/per_week";
const OSIRIS_ICALENDAR_URL = "https://mborijnland.osiris-student.nl/student/osiris/student/icalendar/url";
const AMSTERDAM_DATE_FORMATTER = new Intl.DateTimeFormat("en-CA", {
   timeZone: "Europe/Amsterdam",
   year: "numeric",
   month: "2-digit",
   day: "2-digit",
});

export interface OsirisTeacher {
   naam: string;
}

export interface OsirisRosterEntry {
   id_rooster: string;
   datum: string;
   onderwerp: string;
   subonderwerp: string;
   tijd_vanaf: string;
   tijd_tm: string;
   locatie: string;
   locatie_adres: string;
   docenten: OsirisTeacher[];
   actueel: "J" | "N";
}

export interface OsirisDay {
   datum: string;
   rooster: OsirisRosterEntry[];
}

export interface OsirisWeek {
   jaar: number;
   week: number;
   startdatum: string;
   einddatum: string;
   dagen: OsirisDay[];
}

export interface OsirisRosterResponse {
   items: OsirisWeek[];
   hasMore: boolean;
   limit: number;
   offset: number;
   count: number;
   source?: "per_week" | "icalendar" | "mixed";
}

const WEEK_CACHE_TTL_MS = 60_000;
const weekCache = new Map<string, { data: OsirisRosterResponse; expiresAt: number }>();
const inFlightRequests = new Map<string, Promise<OsirisRosterResponse>>();

function getCacheKey(offset: number, limit: number, bearerToken: string) {
   return `${hashToken(bearerToken)}:${offset}:${limit}`;
}

export async function fetchOsirisRosterWeeks(offset: number, limit = 1, tokenOverride?: string | null): Promise<OsirisRosterResponse> {
   const customToken = normalizeToken(tokenOverride);
   const bearerToken = customToken ?? getEnvValue("BEARER_TOKEN");

   if (!bearerToken) {
      throw new Error("BEARER_TOKEN is missing. Add it to .env before using live OSIRIS data.");
   }

   const safeLimit = Math.max(1, limit);
   const cacheKey = getCacheKey(offset, safeLimit, bearerToken);

   const cachedWeek = weekCache.get(cacheKey);
   if (cachedWeek && cachedWeek.expiresAt > Date.now()) {
      return cachedWeek.data;
   }

   const inFlight = inFlightRequests.get(cacheKey);
   if (inFlight) {
      return inFlight;
   }

   const request = fetchOsirisRosterRange(offset, safeLimit, bearerToken)
      .then((data) => {
         weekCache.set(cacheKey, {
            data,
            expiresAt: Date.now() + WEEK_CACHE_TTL_MS,
         });
         return data;
      })
      .finally(() => {
         inFlightRequests.delete(cacheKey);
      });

   inFlightRequests.set(cacheKey, request);
   return request;
}

async function fetchOsirisRosterRange(offset: number, limit: number, bearerToken: string): Promise<OsirisRosterResponse> {
   if (offset >= 0) {
      return fetchOsirisRosterWeeksFromEndpoint(offset, limit, bearerToken);
   }

   const firstFutureOffset = Math.max(0, offset);
   const pastLimit = Math.min(limit, firstFutureOffset - offset);
   if (pastLimit === limit) {
      return fetchOsirisRosterWeeksFromICalendar(offset, limit, bearerToken);
   }

   const [past, future] = await Promise.all([
      fetchOsirisRosterWeeksFromICalendar(offset, pastLimit, bearerToken),
      fetchOsirisRosterWeeksFromEndpoint(0, limit - pastLimit, bearerToken),
   ]);

   return {
      items: [...past.items, ...future.items],
      hasMore: future.hasMore,
      limit,
      offset,
      count: past.items.length + future.items.length,
      source: "mixed",
   };
}

async function fetchOsirisRosterWeeksFromEndpoint(offset: number, limit: number, bearerToken: string): Promise<OsirisRosterResponse> {
   const searchParams = new URLSearchParams({
      limit: String(limit),
      offset: String(offset),
   });

   const response = await fetch(`${OSIRIS_ROSTER_URL}?${searchParams.toString()}`, {
      headers: {
         Authorization: bearerToken,
         Accept: "application/json",
      },
   });

   if (!response.ok) {
      throw new Error(`OSIRIS request failed with ${response.status}.`);
   }

   return {
      ...((await response.json()) as OsirisRosterResponse),
      source: "per_week",
   };
}

async function fetchOsirisRosterWeeksFromICalendar(offset: number, limit: number, bearerToken: string): Promise<OsirisRosterResponse> {
   const [anchor, events] = await Promise.all([fetchOsirisRosterWeeksFromEndpoint(0, 1, bearerToken), fetchOsirisCalendarEvents(bearerToken)]);
   const anchorWeek = anchor.items[0];

   if (!anchorWeek) {
      throw new Error("OSIRIS roster response did not include the current week.");
   }

   const anchorStart = parseLocalDate(getDatePart(anchorWeek.startdatum));
   const items = Array.from({ length: limit }, (_, index) => createICalendarWeek(anchorStart, offset + index, events));
   const earliestEventStart = events.reduce<Date | null>((earliest, event) => (!earliest || event.start < earliest ? event.start : earliest), null);
   const allRequestedWeeksAreBeforeFeed = earliestEventStart ? items.every((week) => parseLocalDate(getDatePart(week.einddatum)) < startOfDay(earliestEventStart)) : true;

   if (allRequestedWeeksAreBeforeFeed) {
      const firstAvailable = earliestEventStart ? formatLocalDate(earliestEventStart) : "the requested period";
      throw new Error(`OSIRIS iCalendar does not expose roster data before ${firstAvailable}.`);
   }

   return {
      items,
      hasMore: true,
      limit,
      offset,
      count: items.length,
      source: "icalendar",
   };
}

interface OsirisICalendarUrlResponse {
   ical: string;
}

interface ICalendarEvent {
   uid: string;
   summary: string;
   description: string;
   location: string;
   start: Date;
   end: Date;
}

async function fetchOsirisCalendarEvents(bearerToken: string): Promise<ICalendarEvent[]> {
   const urlResponse = await fetch(OSIRIS_ICALENDAR_URL, {
      headers: {
         Authorization: bearerToken,
         Accept: "application/json",
      },
   });

   if (!urlResponse.ok) {
      throw new Error(`OSIRIS iCalendar URL request failed with ${urlResponse.status}.`);
   }

   const { ical } = (await urlResponse.json()) as OsirisICalendarUrlResponse;
   if (!ical) {
      throw new Error("OSIRIS did not return an iCalendar URL.");
   }

   const calendarUrl = ical.startsWith("http") ? ical : new URL(ical, OSIRIS_ICALENDAR_URL).toString();
   const calendarResponse = await fetch(calendarUrl, {
      headers: {
         Accept: "text/calendar,*/*",
      },
   });

   if (!calendarResponse.ok) {
      throw new Error(`OSIRIS iCalendar request failed with ${calendarResponse.status}.`);
   }

   return parseICalendarEvents(await calendarResponse.text());
}

function parseICalendarEvents(calendarText: string): ICalendarEvent[] {
   const unfolded = calendarText.replace(/\r?\n[ \t]/g, "");
   const eventMatches = unfolded.matchAll(/BEGIN:VEVENT([\s\S]*?)END:VEVENT/g);
   const events: ICalendarEvent[] = [];

   for (const match of eventMatches) {
      const block = match[1] ?? "";
      const start = parseICalendarDateTime(readICalendarProperty(block, "DTSTART"));
      const end = parseICalendarDateTime(readICalendarProperty(block, "DTEND"));

      if (!start || !end) {
         continue;
      }

      events.push({
         uid: readICalendarProperty(block, "UID") || `${start.toISOString()}-${readICalendarProperty(block, "SUMMARY")}`,
         summary: unescapeICalendarText(readICalendarProperty(block, "SUMMARY")),
         description: unescapeICalendarText(readICalendarProperty(block, "DESCRIPTION")),
         location: unescapeICalendarText(readICalendarProperty(block, "LOCATION")),
         start,
         end,
      });
   }

   return events;
}

function readICalendarProperty(block: string, name: string) {
   const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
   const match = new RegExp(`^${escapedName}(?:;[^:]*)?:(.*)$`, "im").exec(block);
   return match?.[1]?.trim() ?? "";
}

function unescapeICalendarText(value: string) {
   return value.replace(/\\n/gi, "\n").replace(/\\,/g, ",").replace(/\\;/g, ";").replace(/\\\\/g, "\\");
}

function parseICalendarDateTime(value: string): Date | null {
   const match = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/.exec(value);
   if (!match) {
      return null;
   }

   const [, yearText = "", monthText = "", dayText = "", hourText = "0", minuteText = "0", secondText = "0", utcMarker] = match;
   const year = Number(yearText);
   const month = Number(monthText);
   const day = Number(dayText);
   const hour = Number(hourText);
   const minute = Number(minuteText);
   const second = Number(secondText);

   if ([year, month, day, hour, minute, second].some((part) => Number.isNaN(part))) {
      return null;
   }

   return utcMarker ? new Date(Date.UTC(year, month - 1, day, hour, minute, second)) : new Date(year, month - 1, day, hour, minute, second);
}

function createICalendarWeek(anchorStart: Date, offset: number, events: ICalendarEvent[]): OsirisWeek {
   const start = addDays(anchorStart, offset * 7);
   const end = addDays(start, 6);
   const days = Array.from({ length: 7 }, (_, index): OsirisDay => {
      const day = addDays(start, index);
      const dayKey = formatLocalDate(day);
      return {
         datum: dayKey,
         rooster: events.filter((event) => formatLocalDate(event.start) === dayKey).map(toOsirisRosterEntry),
      };
   });

   return {
      jaar: getIsoWeekYear(start),
      week: getIsoWeekNumber(start),
      startdatum: formatLocalDate(start),
      einddatum: formatLocalDate(end),
      dagen: days,
   };
}

function toOsirisRosterEntry(event: ICalendarEvent): OsirisRosterEntry {
   return {
      id_rooster: event.uid,
      datum: formatLocalDate(event.start),
      onderwerp: event.summary,
      subonderwerp: event.description,
      tijd_vanaf: formatLocalTime(event.start),
      tijd_tm: formatLocalTime(event.end),
      locatie: event.location,
      locatie_adres: event.location,
      docenten: [],
      actueel: "J",
   };
}

function addDays(date: Date, days: number) {
   const next = new Date(date);
   next.setDate(next.getDate() + days);
   return next;
}

function startOfDay(date: Date) {
   const next = new Date(date);
   next.setHours(0, 0, 0, 0);
   return next;
}

function parseLocalDate(dateIso: string) {
   const [yearText = "", monthText = "", dayText = ""] = dateIso.split("-");
   const year = Number(yearText);
   const month = Number(monthText);
   const day = Number(dayText);
   return new Date(year, month - 1, day);
}

function getDatePart(dateIso: string) {
   const parsed = new Date(dateIso);
   if (Number.isNaN(parsed.getTime())) {
      return dateIso.split("T")[0] ?? dateIso;
   }

   return AMSTERDAM_DATE_FORMATTER.format(parsed);
}

function formatLocalDate(date: Date) {
   const year = date.getFullYear();
   const month = String(date.getMonth() + 1).padStart(2, "0");
   const day = String(date.getDate()).padStart(2, "0");
   return `${year}-${month}-${day}`;
}

function formatLocalTime(date: Date) {
   const hours = String(date.getHours()).padStart(2, "0");
   const minutes = String(date.getMinutes()).padStart(2, "0");
   return `${hours}:${minutes}`;
}

function getIsoWeekNumber(date: Date) {
   const weekDate = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
   const day = weekDate.getUTCDay() || 7;
   weekDate.setUTCDate(weekDate.getUTCDate() + 4 - day);
   const yearStart = new Date(Date.UTC(weekDate.getUTCFullYear(), 0, 1));
   return Math.ceil(((weekDate.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
}

function getIsoWeekYear(date: Date) {
   const weekDate = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
   const day = weekDate.getUTCDay() || 7;
   weekDate.setUTCDate(weekDate.getUTCDate() + 4 - day);
   return weekDate.getUTCFullYear();
}

function hashToken(token: string): string {
   return crypto.createHash("sha256").update(token).digest("base64url").slice(0, 24);
}

function normalizeToken(token: string | null | undefined): string | undefined {
   const trimmed = token?.trim();
   if (trimmed) {
      return trimmed;
   }

   return undefined;
}
