export const dayLabel = new Intl.DateTimeFormat("en-GB", { weekday: "long" });
export const dayShortLabel = new Intl.DateTimeFormat("en-GB", { weekday: "short" });
export const monthDayLabel = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" });
export const fullDayLabel = new Intl.DateTimeFormat("en-GB", {
   weekday: "long",
   day: "numeric",
   month: "long",
});
export const timeLabel = new Intl.DateTimeFormat("en-GB", {
   hour: "2-digit",
   minute: "2-digit",
});
export const weekRangeLabel = new Intl.DateTimeFormat("en-GB", {
   day: "numeric",
   month: "short",
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

export function toDayKey(date: Date) {
   const year = date.getFullYear();
   const month = String(date.getMonth() + 1).padStart(2, "0");
   const day = String(date.getDate()).padStart(2, "0");
   return `${year}-${month}-${day}`;
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
