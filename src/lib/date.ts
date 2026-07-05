const AMSTERDAM_TIME_ZONE = "Europe/Amsterdam";

export const dayLabel = new Intl.DateTimeFormat("en-GB", { weekday: "long", timeZone: AMSTERDAM_TIME_ZONE });
export const dayShortLabel = new Intl.DateTimeFormat("en-GB", { weekday: "short", timeZone: AMSTERDAM_TIME_ZONE });
export const monthDayLabel = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: AMSTERDAM_TIME_ZONE });
export const fullDayLabel = new Intl.DateTimeFormat("en-GB", {
   weekday: "long",
   day: "numeric",
   month: "long",
   timeZone: AMSTERDAM_TIME_ZONE,
});
export const timeLabel = new Intl.DateTimeFormat("en-GB", {
   hour: "2-digit",
   minute: "2-digit",
   timeZone: AMSTERDAM_TIME_ZONE,
});
export const weekRangeLabel = new Intl.DateTimeFormat("en-GB", {
   day: "numeric",
   month: "short",
   timeZone: AMSTERDAM_TIME_ZONE,
});

export function parseIsoDateToLocal(isoDate: string) {
   const datePart = isoDate.split("T")[0] ?? isoDate;
   const match = /^\d{4}-\d{2}-\d{2}$/.exec(datePart);
   if (!match) {
      return new Date(isoDate);
   }

   const [yearText, monthText, dayText] = datePart.split("-");
   const year = Number(yearText);
   const month = Number(monthText);
   const day = Number(dayText);
   return new Date(year, month - 1, day);
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

   return new Date(year, month - 1, day, hours, minutes, seconds, 0);
}

const AMSTERDAM_DATE_FORMATTER = new Intl.DateTimeFormat("en-CA", {
   timeZone: AMSTERDAM_TIME_ZONE,
   year: "numeric",
   month: "2-digit",
   day: "2-digit",
});

export function toDayKey(date: Date) {
   return AMSTERDAM_DATE_FORMATTER.format(date);
}

export function formatLocalIsoDate(date: Date) {
   const year = date.getFullYear();
   const month = String(date.getMonth() + 1).padStart(2, "0");
   const day = String(date.getDate()).padStart(2, "0");
   return `${year}-${month}-${day}`;
}

export function getLocalWeekStartIso(date: Date) {
   const monday = new Date(date);
   const day = monday.getDay();
   monday.setDate(monday.getDate() + (day === 0 ? -6 : 1 - day));
   return formatLocalIsoDate(monday);
}

export function formatWeekTitle(startIso: string, endIso: string, weekNumber: number) {
   const start = parseIsoDateToLocal(startIso);
   const end = parseIsoDateToLocal(endIso);
   return `Week ${weekNumber}: ${weekRangeLabel.format(start)} - ${weekRangeLabel.format(end)}`;
}

export function shiftIsoDateByDays(isoDate: string, days: number) {
   const date = new Date(isoDate);
   date.setUTCDate(date.getUTCDate() + days);
   return date.toISOString();
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
   return date.getHours() * 60 + date.getMinutes();
}
