import { isoWeekNumber, shiftCalendarDate } from "../../shared/calendar";

// Loaded only by the production smoke process. Unknown destinations fail closed.
globalThis.fetch = (input) => {
   const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
   if (url.origin !== "https://smoke.osiris.test") return Promise.reject(new Error("Unexpected smoke-test upstream"));
   const offset = Number(url.searchParams.get("offset"));
   const limit = Number(url.searchParams.get("limit"));
   const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Amsterdam", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
   const weekday = new Date(today + "T00:00:00Z").getUTCDay() || 7;
   const monday = shiftCalendarDate(today, 1 - weekday);
   const items = Array.from({ length: limit }, (_, index) => {
      const start = shiftCalendarDate(monday, (offset + index) * 7);
      return {
         jaar: Number(start.slice(0, 4)),
         week: isoWeekNumber(start),
         startdatum: start,
         einddatum: shiftCalendarDate(start, 6),
         dagen: [
            {
               datum: start,
               rooster: [
                  {
                     id_rooster: `smoke-${offset + index}`,
                     datum: start,
                     onderwerp: "Smoke class",
                     subonderwerp: "",
                     tijd_vanaf: "09:00",
                     tijd_tm: "10:00",
                     locatie: "A1",
                     locatie_adres: "Campus",
                     docenten: [{ naam: "Teacher" }],
                     actueel: "J",
                  },
               ],
            },
         ],
      };
   });
   return Promise.resolve(Response.json({ items, offset, limit, count: items.length, hasMore: true }));
};
