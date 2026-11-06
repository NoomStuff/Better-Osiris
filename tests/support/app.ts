import { isoWeekNumber } from "../../shared/calendar";
import { expect, test as base, type Page } from "@playwright/test";

export const FIXED_NOW_ISO = "2026-06-16T09:45:00+02:00";
export const WEEK_START_ISO = "2026-06-15";
export const MS_PER_DAY = 24 * 60 * 60 * 1000;
export const OSIRIS_BEARER_TOKEN_HELP_URL = "https://youtu.be/MbcI61KIQbI";

/** Every browser test starts on a fixed clock with mocked APIs, and fails on React update warnings or page errors. */
export const test = base.extend<{ appHarness: undefined }>({
   appHarness: [
      async ({ page }, use) => {
         const errors: string[] = [];
         page.on("pageerror", (error) => errors.push(error.stack ?? error.message));
         page.on("console", (message) => {
            if (message.type() === "error" && /Cannot update a component|Maximum update depth|Each child in a list should/.test(message.text()))
               errors.push(message.text());
         });
         await page.emulateMedia({ colorScheme: "dark" });
         await installFixedClock(page);
         await mockAppApis(page);
         await use(undefined);
         expect(errors).toEqual([]);
      },
      { auto: true },
   ],
});
export { expect };

export async function installFixedClock(page: Page) {
   await page.addInitScript((fixedNowIso) => {
      const RealDate = Date;
      let timestamp: number | undefined;
      const fixedNow = () => {
         if (timestamp !== undefined) return timestamp;
         try {
            timestamp = new RealDate(localStorage.getItem("test-clock") ?? fixedNowIso).getTime();
         } catch {
            timestamp = new RealDate(fixedNowIso).getTime();
         }
         // Read once after the init scripts run; dates must not access storage during render or teardown.
         return timestamp;
      };
      type DateConstructorArgs =
         | []
         | [string | number | Date]
         | [number, number, number?]
         | [number, number, number | undefined, number]
         | [number, number, number | undefined, number | undefined, number]
         | [number, number, number | undefined, number | undefined, number | undefined, number]
         | [number, number, number | undefined, number | undefined, number | undefined, number | undefined, number];

      class MockDate extends RealDate {
         static setTestTime(iso: string) {
            timestamp = new RealDate(iso).getTime();
         }
         constructor(...args: DateConstructorArgs) {
            if (args.length === 0) {
               super(fixedNow());
               return;
            }

            if (args.length === 1) {
               super(args[0]);
               return;
            }

            super(args[0], args[1], args[2] ?? 1, args[3] ?? 0, args[4] ?? 0, args[5] ?? 0, args[6] ?? 0);
         }

         static override now() {
            return fixedNow();
         }
      }

      Object.setPrototypeOf(MockDate, RealDate);
      globalThis.Date = MockDate as unknown as DateConstructor;
   }, FIXED_NOW_ISO);
}

export async function installCachedLastWeek(page: Page) {
   await page.addInitScript(
      ({ cacheKey, timeZoneKey, timeZone, week }) => {
         window.localStorage.setItem(timeZoneKey, timeZone);
         window.localStorage.setItem(
            cacheKey,
            JSON.stringify({
               contextId: "test-context",
               timeZone,
               weeks: [{ data: week, fetchedAt: Date.now(), checkedAt: Date.now(), changedAt: Date.now() }],
            })
         );
      },
      {
         cacheKey: "roster-weeks-v3",
         timeZoneKey: "roster-time-zone-v1",
         timeZone: "Europe/Amsterdam",
         week: createWeek(-1),
      }
   );
}

export async function swipeWeek(page: Page, direction: "previous" | "next", selector = ".app-content-frame") {
   await page.evaluate(
      ({ swipeDirection, selector }) => {
         const target = document.querySelector(selector);
         if (!target) throw new Error(`Missing swipe target ${selector}`);
         const startX = swipeDirection === "next" ? 320 : 120;
         const endX = swipeDirection === "next" ? 120 : 320;
         const start = { identifier: 1, target, clientX: startX, clientY: 300 };
         const end = { identifier: 1, target, clientX: endX, clientY: 300 };
         const startEvent = new Event("touchstart", { bubbles: true });
         const endEvent = new Event("touchend", { bubbles: true });
         Object.defineProperty(startEvent, "touches", { value: [start] });
         Object.defineProperty(endEvent, "changedTouches", { value: [end] });
         target.dispatchEvent(startEvent);
         target.dispatchEvent(endEvent);
      },
      { swipeDirection: direction, selector }
   );
}

export async function mockAppApis(page: Page) {
   let hasCustomToken = true;

   await page.route("**/api/roster/config", async (route) => {
      await route.fulfill({
         status: 200,
         contentType: "application/json",
         body: JSON.stringify({ timeZone: "Europe/Amsterdam" }),
      });
   });

   await page.route("**/api/settings/osiris-token", async (route) => {
      const method = route.request().method();
      if (method === "DELETE") {
         hasCustomToken = false;
      } else if (method === "PUT") {
         hasCustomToken = true;
      }

      await route.fulfill({
         status: 200,
         contentType: "application/json",
         body: JSON.stringify({
            hasCustomToken,
            hasBearerToken: hasCustomToken,
            contextId: hasCustomToken ? "test-context" : null,
            ...(method === "PUT" ? { verifiedBatch: createRosterBatch(0, 5) } : {}),
         }),
      });
   });

   await page.route("**/api/roster/weeks?*", async (route) => {
      const url = new URL(route.request().url());
      const offset = Number(url.searchParams.get("offset") ?? "0");
      const limit = Number(url.searchParams.get("limit") ?? "5");

      await route.fulfill({
         status: 200,
         contentType: "application/json",
         body: JSON.stringify(createRosterBatch(offset, limit)),
      });
   });
}

export function createRosterBatch(offset: number, limit: number) {
   return {
      offset,
      limit,
      contextId: "test-context",
      fetchedAt: Date.now(),
      hasMore: offset + limit < 50,
      timeZone: "Europe/Amsterdam",
      weeks: Array.from({ length: limit }, (_, index) => createWeek(offset + index)),
   };
}

export function createShiftedRosterBatch(offset: number, limit: number, shift: number) {
   const batch = createRosterBatch(offset + shift, limit);
   batch.offset = offset;
   batch.weeks.forEach((week) => {
      week.week.offset -= shift;
   });
   return batch;
}

export function createWeek(offset: number) {
   const startDate = new Date(`${WEEK_START_ISO}T00:00:00Z`);
   startDate.setUTCDate(startDate.getUTCDate() + offset * 7);
   const start = toIsoDate(startDate);
   const endDate = new Date(startDate.getTime() + 6 * MS_PER_DAY);
   const tuesday = new Date(startDate.getTime() + MS_PER_DAY);
   const tuesdayIso = toIsoDate(tuesday);

   return {
      week: {
         offset,
         number: isoWeekNumber(start),
         start,
         end: toIsoDate(endDate),
      },
      classes: [
         {
            id: `class-${offset}-1`,
            title: `SOURCE_TITLE_${offset}_1`,
            subject: `SOURCE_SUBJECT_${offset}_1`,
            start: `${tuesdayIso}T09:00:00`,
            end: `${tuesdayIso}T10:30:00`,
            teacher: "SOURCE_TEACHER",
            room: "SOURCE_ROOM",
            location: "SOURCE_LOCATION",
            description: "SOURCE_DESCRIPTION",
            status: "scheduled",
         },
         {
            id: `class-${offset}-2`,
            title: `SOURCE_TITLE_${offset}_2`,
            subject: `SOURCE_SUBJECT_${offset}_2`,
            start: `${tuesdayIso}T11:00:00`,
            end: `${tuesdayIso}T12:00:00`,
            teacher: "SOURCE_TEACHER",
            room: "SOURCE_ROOM",
            location: "SOURCE_LOCATION",
            description: "SOURCE_DESCRIPTION",
            status: "scheduled",
         },
      ],
      source: {
         mode: "test",
         note: "Generated browser-test roster data.",
      },
   };
}

export function toIsoDate(date: Date) {
   return date.toISOString().slice(0, 10);
}
