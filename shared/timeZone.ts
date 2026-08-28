const dateFormatters = new Map<string, Intl.DateTimeFormat>();

export function isValidTimeZone(value: string) {
   try {
      resolveCanonicalTimeZone(value);
      return true;
   } catch {
      return false;
   }
}

/** Resolves any accepted time zone spelling (case, alias, offset) to its canonical IANA name. Throws for unknown zones. */
export function resolveCanonicalTimeZone(value: string) {
   return getZoneDateFormatter(value).resolvedOptions().timeZone;
}

/** Cached en-CA date-only formatter per zone; the only Intl object the server needs for roster data. */
export function getZoneDateFormatter(timeZone: string) {
   let formatter = dateFormatters.get(timeZone);
   if (!formatter) {
      formatter = new Intl.DateTimeFormat("en-CA", {
         timeZone,
         year: "numeric",
         month: "2-digit",
         day: "2-digit",
      });
      dateFormatters.set(timeZone, formatter);
   }
   return formatter;
}
