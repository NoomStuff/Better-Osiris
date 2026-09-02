import { getZoneDateFormatter } from "../../shared/timeZone";
import { getRosterTimeZone } from "./rosterTimeZone";

interface RosterFormatters {
   dayLabel: Intl.DateTimeFormat;
   dayShortLabel: Intl.DateTimeFormat;
   monthDayLabel: Intl.DateTimeFormat;
   fullDayLabel: Intl.DateTimeFormat;
   timeLabel: Intl.DateTimeFormat;
   weekRangeLabel: Intl.DateTimeFormat;
   dayParts: Intl.DateTimeFormat;
   dateKey: Intl.DateTimeFormat;
}

let formattersCache: { timeZone: string; formatters: RosterFormatters } | null = null;

function getFormatters() {
   const timeZone = getRosterTimeZone();
   if (formattersCache?.timeZone !== timeZone) {
      formattersCache = { timeZone, formatters: createFormatters(timeZone) };
   }
   return formattersCache.formatters;
}

function createFormatters(timeZone: string): RosterFormatters {
   return {
      dayLabel: new Intl.DateTimeFormat("en-GB", { weekday: "long", timeZone }),
      dayShortLabel: new Intl.DateTimeFormat("en-GB", { weekday: "short", timeZone }),
      monthDayLabel: new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone }),
      fullDayLabel: new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone }),
      timeLabel: new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone }),
      weekRangeLabel: new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone }),
      dayParts: new Intl.DateTimeFormat("en-CA", {
         timeZone,
         year: "numeric",
         month: "2-digit",
         day: "2-digit",
         hour: "2-digit",
         minute: "2-digit",
         second: "2-digit",
         hourCycle: "h23",
      }),
      dateKey: getZoneDateFormatter(timeZone),
   };
}

function lazyLabel(select: (formatters: RosterFormatters) => Intl.DateTimeFormat) {
   return { format: (date: Date) => select(getFormatters()).format(date) };
}

export const dayLabel = lazyLabel((formatters) => formatters.dayLabel);
export const dayShortLabel = lazyLabel((formatters) => formatters.dayShortLabel);
export const monthDayLabel = lazyLabel((formatters) => formatters.monthDayLabel);
export const fullDayLabel = lazyLabel((formatters) => formatters.fullDayLabel);
export const timeLabel = lazyLabel((formatters) => formatters.timeLabel);
export const weekRangeLabel = lazyLabel((formatters) => formatters.weekRangeLabel);

export function parseIsoDateToLocal(isoDate: string) {
   const datePart = isoDate.split("T")[0] ?? isoDate;
   const match = /^\d{4}-\d{2}-\d{2}$/.exec(datePart);
   if (!match) {
      return new Date(isoDate);
   }

   return parseLocalDateTime(`${datePart}T12:00:00`);
}

export function parseLocalDateTime(isoDateTime: string) {
   const normalized = isoDateTime.replace(" ", "T");
   const hasTimeZone = /Z$|[+-]\d{2}:?\d{2}$/.test(normalized);
   const [rawDatePart, rawTimePart] = normalized.split("T");
   const datePart = rawDatePart ?? "";
   const timePart = rawTimePart ?? "00:00:00";
   const match = /^\d{4}-\d{2}-\d{2}$/.exec(datePart);

   if (!match) {
      return new Date(isoDateTime);
   }

   if (hasTimeZone) {
      // Timezone-aware input identifies an absolute instant on its own; everything the roster serves is timezone-less.
      return new Date(normalized);
   }

   const [hoursText = "0", minutesText = "0", secondsText = "0"] = timePart.split(":");
   const secondsClean = secondsText.split(".")[0] ?? "0";
   const [yearText, monthText, dayText] = datePart.split("-");
   const year = Number(yearText);
   const month = Number(monthText);
   const day = Number(dayText);
   const hours = Number(hoursText);
   const minutes = Number(minutesText);
   const seconds = Number(secondsClean);

   if ([year, month, day, hours, minutes, seconds].some((value) => Number.isNaN(value))) {
      return new Date(isoDateTime);
   }

   return createDateInRosterZone(year, month, day, hours, minutes, seconds);
}

export function toDayKey(date: Date) {
   return getFormatters().dateKey.format(date);
}

export function getLocalWeekStartIso(date: Date) {
   const dayKey = toDayKey(date);
   const day = getIsoWeekday(dayKey);
   return shiftIsoDateByDays(dayKey, 1 - day);
}

export function formatWeekTitle(startIso: string, endIso: string, weekNumber: number) {
   const start = parseIsoDateToLocal(startIso);
   const end = parseIsoDateToLocal(endIso);
   return `Week ${weekNumber}: ${weekRangeLabel.format(start)} - ${weekRangeLabel.format(end)}`;
}

export function shiftIsoDateByDays(isoDate: string, days: number) {
   const datePart = isoDate.split("T")[0] ?? isoDate;
   const date = new Date(`${datePart}T00:00:00Z`);
   date.setUTCDate(date.getUTCDate() + days);
   return date.toISOString().slice(0, 10);
}

export function getIsoWeekNumber(isoDate: string) {
   const date = new Date(isoDate);
   const utcDate = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
   const day = utcDate.getUTCDay() || 7;
   utcDate.setUTCDate(utcDate.getUTCDate() + 4 - day);
   const yearStart = new Date(Date.UTC(utcDate.getUTCFullYear(), 0, 1));
   return Math.ceil(((utcDate.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
}

export function getMinutesFromMidnight(date: Date) {
   const parts = getRosterZoneParts(date);
   return parts.hour * 60 + parts.minute;
}

export function getRosterWeekBounds(date: Date, offset: number) {
   const start = shiftIsoDateByDays(getLocalWeekStartIso(date), offset * 7);
   return { start, end: shiftIsoDateByDays(start, 6) };
}

/** ISO weekday number: 1 = Monday … 7 = Sunday. */
export type IsoWeekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

/** ISO weekday number of a date key: 1 = Monday … 7 = Sunday. */
export function getIsoWeekday(isoDate: string): IsoWeekday {
   const day = new Date(`${isoDate}T00:00:00Z`).getUTCDay();
   return (day === 0 ? 7 : day) as IsoWeekday;
}

function createDateInRosterZone(year: number, month: number, day: number, hour: number, minute: number, second: number) {
   const utcGuess = Date.UTC(year, month - 1, day, hour, minute, second);
   const firstOffset = getRosterZoneOffsetMilliseconds(new Date(utcGuess));
   const firstCandidate = new Date(utcGuess - firstOffset);
   const correctedOffset = getRosterZoneOffsetMilliseconds(firstCandidate);
   return new Date(utcGuess - correctedOffset);
}

function getRosterZoneOffsetMilliseconds(date: Date) {
   const parts = getRosterZoneParts(date);
   const representedAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
   return representedAsUtc - date.getTime();
}

function getRosterZoneParts(date: Date) {
   const values = Object.fromEntries(
      getFormatters()
         .dayParts.formatToParts(date)
         .filter((part) => part.type !== "literal")
         .map((part) => [part.type, Number(part.value)])
   );
   return {
      year: values["year"] ?? 0,
      month: values["month"] ?? 0,
      day: values["day"] ?? 0,
      hour: values["hour"] ?? 0,
      minute: values["minute"] ?? 0,
      second: values["second"] ?? 0,
   };
}
