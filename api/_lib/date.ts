const AMSTERDAM_DATE_FORMATTER = new Intl.DateTimeFormat("en-CA", {
   timeZone: "Europe/Amsterdam",
   year: "numeric",
   month: "2-digit",
   day: "2-digit",
});

export function toDayKey(date: Date) {
   return AMSTERDAM_DATE_FORMATTER.format(date);
}
