import { shiftCalendarDate } from "../../shared/calendar";
import { getZoneDateFormatter } from "../../shared/timeZone";
import { getRosterTimeZone } from "./rosterTimeZone";

interface RosterFormatters {
   dayLabel: Intl.DateTimeFormat;
   dayShortLabel: Intl.DateTimeFormat;
   monthDayLabel: Intl.DateTimeFormat;
   fullDayLabel: Intl.DateTimeFormat;
   timeLabel: Intl.DateTimeFormat;
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
   const hours = Number(hoursText);
   const minutes = Number(minutesText);
   const seconds = Number(secondsClean);

   // The date part already matched the calendar format; only the free-form time can be garbage.
   if ([hours, minutes, seconds].some((value) => Number.isNaN(value))) {
      return new Date(isoDateTime);
   }

   return createDateInRosterZone(Number(yearText), Number(monthText), Number(dayText), hours, minutes, seconds);
}

export function toDayKey(date: Date) {
   return getFormatters().dateKey.format(date);
}

export function getLocalWeekStartIso(date: Date) {
   const dayKey = toDayKey(date);
   const day = getIsoWeekday(dayKey);
   return shiftCalendarDate(dayKey, 1 - day);
}

export function formatWeekTitle(startIso: string, endIso: string, weekNumber: number) {
   const start = parseIsoDateToLocal(startIso);
   const end = parseIsoDateToLocal(endIso);
   return `Week ${weekNumber}: ${monthDayLabel.format(start)} - ${monthDayLabel.format(end)}`;
}

export function getMinutesFromMidnight(date: Date) {
   const parts = getRosterZoneParts(date);
   return parts.hour * 60 + parts.minute;
}

export function getRosterWeekBounds(date: Date, offset: number) {
   const start = shiftCalendarDate(getLocalWeekStartIso(date), offset * 7);
   return { start, end: shiftCalendarDate(start, 6) };
}

/** ISO weekday number: 1 = Monday … 7 = Sunday. */
export type IsoWeekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

/** ISO weekday number of a date key: 1 = Monday … 7 = Sunday. */
export function getIsoWeekday(isoDate: string): IsoWeekday {
   const day = new Date(`${isoDate}T00:00:00Z`).getUTCDay();
   return (day === 0 ? 7 : day) as IsoWeekday;
}

/** Zero-padded 24-hour clock text for a minute-of-day value. */
export function formatClock(minutes: number) {
   return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
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
