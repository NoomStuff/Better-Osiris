import { expect, test, type Page } from "@playwright/test";

const FIXED_NOW_ISO = "2026-06-16T09:45:00+02:00";
const WEEK_START_ISO = "2026-06-15";
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const OSIRIS_BEARER_TOKEN_HELP_URL = "https://youtu.be/MbcI61KIQbI";

test.beforeEach(async ({ page }) => {
   await installFixedClock(page);
   await mockAppApis(page);
});

test("week navigation and view controls work with mocked roster data", async ({ page }) => {
   await installCachedLastWeek(page);
   await page.goto("/");

   await expect(page.getByRole("heading", { name: /Week 25:/ })).toBeVisible();
   await expect(page.locator(".app-toolbar__identity .eyebrow")).toHaveCount(0);
   await expect(page.getByRole("button", { name: "Previous week" })).toBeEnabled();
   await expect(page.getByRole("button", { name: "Next week" })).toBeEnabled();
   await expect(page.getByRole("button", { name: "SOURCE_TITLE_0_1" })).toBeVisible();

   await page.getByRole("button", { name: "Previous week" }).click();
   await expect(page.locator(".weekbar__label")).toHaveText("Last week");
   await expect(page.getByRole("heading", { name: /Week 24:/ })).toBeVisible();
   await expect(page.getByRole("button", { name: "SOURCE_TITLE_-1_1" })).toBeVisible();

   await page.locator(".weekbar__content").click();
   await expect(page.locator(".weekbar__label")).toHaveText("This week");
   await expect(page.getByRole("heading", { name: /Week 25:/ })).toBeVisible();

   await page.getByRole("button", { name: "Next week" }).click();
   await expect(page.locator(".weekbar__label")).toHaveText("Next week");
   await expect(page.getByRole("heading", { name: /Week 26:/ })).toBeVisible();
   await expect(page.getByRole("button", { name: "Previous week" })).toBeEnabled();
   await expect(page.getByRole("button", { name: "SOURCE_TITLE_1_1" })).toBeVisible();

   await page.keyboard.press("Space");
   await expect(page.locator(".weekbar__label")).toHaveText("This week");
   await expect(page.getByRole("heading", { name: /Week 25:/ })).toBeVisible();

   await page.getByRole("tab", { name: "Grid view" }).click();
   await expect(page.locator(".grid-shell")).toBeVisible();
   await expect(page.getByRole("radio", { name: "30m" })).toBeVisible();

   await page.getByRole("radio", { name: "30m" }).click();
   await expect(page.getByRole("radio", { name: "30m" })).toHaveAttribute("aria-checked", "true");

   await page.getByRole("tab", { name: "Agenda view" }).click();
   await expect(page.locator(".agenda-view")).toBeVisible();
});

test("defaults to grid on desktop when no roster view was saved", async ({ page }) => {
   await page.setViewportSize({ width: 1280, height: 720 });
   await page.goto("/");

   await expect(page.locator(".grid-shell")).toBeVisible();
   await expect(page.getByRole("tab", { name: "Grid view" })).toHaveAttribute("aria-selected", "true");
});

test("defaults to agenda on mobile when no roster view was saved", async ({ page }) => {
   await page.setViewportSize({ width: 390, height: 844 });
   await page.goto("/");

   await expect(page.locator(".agenda-view")).toBeVisible();
   await expect(page.getByRole("tab", { name: "Agenda view" })).toHaveAttribute("aria-selected", "true");
});

test("keeps a saved roster view over the viewport default", async ({ page }) => {
   await page.setViewportSize({ width: 390, height: 844 });
   await page.addInitScript(() => {
      window.localStorage.setItem("roster-view-mode", "grid");
   });
   await page.goto("/");

   await expect(page.locator(".grid-shell")).toBeVisible();
   await expect(page.getByRole("tab", { name: "Grid view" })).toHaveAttribute("aria-selected", "true");
});

test("previous week is disabled when no locally cached last week is available", async ({ page }) => {
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

   await page.goto("/");

   await expect(page.getByRole("heading", { name: /Week 25:/ })).toBeVisible();
   await expect(page.getByRole("button", { name: "SOURCE_TITLE_0_1" })).toBeVisible();
   await expect(page.getByRole("button", { name: "Previous week" })).toBeDisabled();
});

test("next week and future shortcuts are disabled when a preloaded future week is unavailable", async ({ page }) => {
   await page.route("**/api/roster/weeks?*", async (route) => {
      const url = new URL(route.request().url());
      const offset = Number(url.searchParams.get("offset") ?? "0");
      const limit = Number(url.searchParams.get("limit") ?? "5");

      if (offset >= 5) {
         await route.fulfill({
            status: 502,
            contentType: "application/json",
            body: JSON.stringify({ error: "OSIRIS request failed with 502." }),
         });
         return;
      }

      await route.fulfill({
         status: 200,
         contentType: "application/json",
         body: JSON.stringify(createRosterBatch(offset, limit)),
      });
   });

   await page.goto("/");
   await expect(page.getByRole("heading", { name: /Week 25:/ })).toBeVisible();

   await page.keyboard.press("4");
   await expect(page.locator(".weekbar__label")).toHaveText("In 4 weeks");
   await expect(page.getByRole("heading", { name: /Week 29:/ })).toBeVisible();
   await expect(page.getByRole("button", { name: "SOURCE_TITLE_4_1" })).toBeVisible();
   await expect(page.getByRole("button", { name: "Next week" })).toBeDisabled();

   await page.keyboard.press("ArrowRight");
   await expect(page.locator(".weekbar__label")).toHaveText("In 4 weeks");

   await page.keyboard.press("5");
   await expect(page.locator(".weekbar__label")).toHaveText("In 4 weeks");
});

test("settings dialog opens, resets token state, and closes", async ({ page }) => {
   await page.goto("/");

   await page.getByRole("button", { name: "Open settings" }).click();
   await expect(page.getByRole("dialog", { name: "Preferences" })).toBeVisible();
   await expect(page.getByText("Roster requests are using your saved bearer token.")).toBeVisible();
   await expect(page.getByRole("link", { name: "How to get one" })).toHaveAttribute("href", OSIRIS_BEARER_TOKEN_HELP_URL);
   await expect(page.getByRole("button", { name: "Save token" })).toBeDisabled();

   await page.getByRole("button", { name: "Reset" }).click();
   await expect(page.getByRole("dialog", { name: "Reset bearer token?" })).toBeVisible();
   await page.getByRole("button", { name: "Reset token" }).click();
   await expect(page.getByRole("dialog", { name: "Reset bearer token?" })).toBeHidden();
   await expect(page.getByRole("dialog", { name: "Preferences" })).toBeVisible();
   await expect(page.getByText("No bearer token is set.")).toBeVisible();

   await page.locator(".settings-dialog__header").getByRole("button", { name: "Close settings" }).click();
   await expect(page.getByRole("dialog", { name: "Preferences" })).toBeHidden();
});

test("only the topmost dialog handles Escape and focus stays contained", async ({ page }) => {
   await page.goto("/");
   await page.getByRole("button", { name: "Open settings" }).click();
   const settings = page.getByRole("dialog", { name: "Preferences" });
   await expect(settings).toBeVisible();
   const closeSettingsButton = settings.getByRole("button", { name: "Close settings" });
   await expect(closeSettingsButton).toBeFocused();
   await page.keyboard.press("Shift+Tab");
   await expect(page.getByLabel("Enable devtools")).toBeFocused();
   await page.keyboard.press("Tab");
   await expect(closeSettingsButton).toBeFocused();

   await page.getByRole("button", { name: "Reset" }).click();
   const confirmation = page.getByRole("dialog", { name: "Reset bearer token?" });
   await expect(confirmation).toBeVisible();
   await page.keyboard.press("Escape");

   await expect(confirmation).toBeHidden();
   await expect(settings).toBeVisible();
   await expect(page.getByRole("button", { name: "Reset" })).toBeFocused();
});

test("saving a replacement token refreshes roster data without reloading the page", async ({ page }) => {
   let rosterRequestCount = 0;
   page.on("request", (request) => {
      if (request.url().includes("/api/roster/weeks?")) {
         rosterRequestCount += 1;
      }
   });

   await page.goto("/");
   await expect(page.getByRole("button", { name: "SOURCE_TITLE_0_1" })).toBeVisible();
   const initialRequestCount = rosterRequestCount;

   await page.getByRole("button", { name: "Open settings" }).click();
   const settings = page.getByRole("dialog", { name: "Preferences" });
   await settings.getByLabel("Bearer token").fill("Bearer replacement-token");
   await settings.getByRole("button", { name: "Save token" }).click();

   await expect.poll(() => rosterRequestCount).toBeGreaterThan(initialRequestCount);
   await expect(settings).toBeVisible();
   await expect(page.getByRole("button", { name: "SOURCE_TITLE_0_1" })).toBeVisible();
});

test("an aborted credential request cannot restore stale roster data", async ({ page }) => {
   let tokenVersion = 1;
   let releaseInitialRequest = () => undefined;
   const initialRequestGate = new Promise<void>((resolve) => {
      releaseInitialRequest = resolve;
   });

   await page.route("**/api/settings/osiris-token", async (route) => {
      const method = route.request().method();
      if (method === "DELETE") {
         tokenVersion = 0;
      } else if (method === "PUT") {
         tokenVersion = 2;
      }

      await route.fulfill({
         status: 200,
         contentType: "application/json",
         body: JSON.stringify({ hasCustomToken: tokenVersion > 0, hasBearerToken: tokenVersion > 0 }),
      });
   });

   await page.route("**/api/roster/weeks?*", async (route) => {
      const requestedTokenVersion = tokenVersion;
      const url = new URL(route.request().url());
      const offset = Number(url.searchParams.get("offset") ?? "0");
      const limit = Number(url.searchParams.get("limit") ?? "5");

      if (requestedTokenVersion === 1 && offset === 0) {
         await initialRequestGate;
      }

      const batch = createRosterBatch(offset, limit);
      const firstLesson = batch.weeks[0]?.lessons[0];
      if (firstLesson) {
         firstLesson.title = `TOKEN_${requestedTokenVersion}_TITLE`;
      }
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(batch) });
   });

   await page.goto("/");
   await page.getByRole("button", { name: "Open settings" }).click();
   await page.getByRole("button", { name: "Reset" }).click();
   await page.getByRole("button", { name: "Reset token" }).click();
   await expect(page.getByText("No bearer token is set.")).toBeVisible();

   releaseInitialRequest();
   await expect(page.getByRole("button", { name: "TOKEN_1_TITLE" })).toHaveCount(0);

   const settings = page.getByRole("dialog", { name: "Preferences" });
   await settings.getByLabel("Bearer token").fill("Bearer fresh-token");
   await settings.getByRole("button", { name: "Save token" }).click();
   await settings.getByRole("button", { name: "Close settings" }).click();

   await expect(page.getByRole("button", { name: "TOKEN_2_TITLE" })).toBeVisible();
   await expect(page.getByRole("button", { name: "TOKEN_1_TITLE" })).toHaveCount(0);
});

test("week swipe navigation is disabled while an overlay is open", async ({ page }) => {
   await page.goto("/");
   await page.getByRole("button", { name: "Open settings" }).click();

   await page.evaluate(() => {
      const target = document.body;
      const start = new Touch({ identifier: 1, target, clientX: 320, clientY: 300 });
      const end = new Touch({ identifier: 1, target, clientX: 120, clientY: 300 });
      window.dispatchEvent(new TouchEvent("touchstart", { touches: [start] }));
      window.dispatchEvent(new TouchEvent("touchend", { changedTouches: [end] }));
   });

   await expect(page.locator(".weekbar__label")).toHaveText("This week");
});

test("collapsed agenda days remove hidden lessons from keyboard navigation", async ({ page }) => {
   await page.goto("/");
   await page.getByRole("tab", { name: "Agenda view" }).click();
   const currentDay = page.locator(".day-group").filter({ hasText: "SOURCE_TITLE_0_1" });
   const currentDayHeader = currentDay.locator(".day-group__header");
   await currentDayHeader.click();

   const collapsedBody = currentDay.locator(".day-group__body");
   await expect(collapsedBody).toHaveAttribute("aria-hidden", "true");
   await expect(collapsedBody).toHaveAttribute("inert", "");
});

test("missing bearer token shows an entry overlay without requesting roster data", async ({ page }) => {
   let rosterWasRequested = false;

   await page.route("**/api/settings/osiris-token", async (route) => {
      await route.fulfill({
         status: 200,
         contentType: "application/json",
         body: JSON.stringify({ hasCustomToken: false, hasBearerToken: false }),
      });
   });

   await page.route("**/api/roster/weeks?*", async (route) => {
      rosterWasRequested = true;
      await route.fulfill({
         status: 500,
         contentType: "application/json",
         body: JSON.stringify({ error: "Roster should not be requested before a bearer token is set." }),
      });
   });

   await page.goto("/");

   await expect(page.getByRole("heading", { name: "Bearer token required" })).toBeVisible();
   await expect(page.getByRole("link", { name: "Learn how to get your bearer token" })).toHaveAttribute("href", OSIRIS_BEARER_TOKEN_HELP_URL);
   const tokenInput = page.getByLabel("Bearer token");
   const saveTokenButton = page.getByRole("button", { name: "Save token" });
   await expect(tokenInput).toBeVisible();
   await expect(saveTokenButton).toBeDisabled();
   await tokenInput.fill("Bearer browser-token");
   await expect(saveTokenButton).toBeEnabled();
   expect(rosterWasRequested).toBe(false);
});

test("devtools can preview changed and cancelled lesson states", async ({ page }) => {
   await page.goto("/");

   await page.getByRole("tab", { name: "Agenda view" }).click();
   await page.getByRole("button", { name: "Open settings" }).click();
   await page.getByLabel("Enable devtools").check();
   await page.getByRole("button", { name: "Mixed" }).click();
   await page.locator(".settings-dialog__header").getByRole("button", { name: "Close settings" }).click();

   await expect(page.locator(".agenda-lesson.status-changed")).toHaveCount(1);
   await expect(page.locator(".agenda-lesson.status-cancelled")).toHaveCount(1);

   await page.getByRole("button", { name: /SOURCE_TITLE_0_1/ }).click();
   await expect(page.locator(".lesson-panel__status--changed")).toHaveText("changed");
   const roomDetails = page.locator(".lesson-panel__details > div", { has: page.locator("dt", { hasText: "Room" }) });
   await expect(roomDetails.locator("s")).toHaveText("A101");
   await expect(roomDetails.locator("strong")).toHaveText("SOURCE_ROOM");
   await expect(page.locator(".lesson-panel__details dt", { hasText: "Date" })).toHaveCount(1);
   await expect(page.locator(".lesson-panel__details dt", { hasText: "Time" })).toHaveCount(1);
   await expect(page.locator(".lesson-panel__details dt", { hasText: "Status" })).toHaveCount(0);
   await page.locator(".lesson-panel__header").getByRole("button", { name: "Close", exact: true }).click();

   await page.getByRole("button", { name: /SOURCE_TITLE_0_2/ }).click();
   await expect(page.locator(".lesson-panel__status--cancelled")).toHaveText("cancelled");
   await expect(page.locator(".lesson-panel__details dt", { hasText: "Status" })).toHaveCount(0);
});

test("time indicators are visible and positioned for the fixed current time", async ({ page }) => {
   await page.goto("/");

   await page.getByRole("tab", { name: "Agenda view" }).click();
   const agendaIndicator = page.locator(".agenda-current-indicator");
   await expect(agendaIndicator).toBeVisible();
   await expect(agendaIndicator).toHaveAttribute("data-visible", "true");
   await expect(agendaIndicator.locator(".agenda-current-indicator__progress")).toHaveCSS("height", /1[0-9]|2[0-9]|3[0-9]|4[0-9]|5[0-9]/);

   await page.getByRole("tab", { name: "Grid view" }).click();
   const gridNowLine = page.locator(".grid-now-line");
   await expect(gridNowLine).toBeVisible();

   const top = await gridNowLine.evaluate((element) => Number.parseFloat((element as HTMLElement).style.top));
   expect(top).toBeGreaterThan(17);
   expect(top).toBeLessThan(18);
});

async function installFixedClock(page: Page) {
   await page.addInitScript((fixedNowIso) => {
      const fixedNow = new Date(fixedNowIso).getTime();
      const RealDate = Date;
      type DateConstructorArgs =
         | []
         | [string | number | Date]
         | [number, number, number?]
         | [number, number, number | undefined, number]
         | [number, number, number | undefined, number | undefined, number]
         | [number, number, number | undefined, number | undefined, number | undefined, number]
         | [number, number, number | undefined, number | undefined, number | undefined, number | undefined, number];

      class MockDate extends RealDate {
         constructor(...args: DateConstructorArgs) {
            if (args.length === 0) {
               super(fixedNow);
               return;
            }

            if (args.length === 1) {
               super(args[0]);
               return;
            }

            super(args[0], args[1], args[2] ?? 1, args[3] ?? 0, args[4] ?? 0, args[5] ?? 0, args[6] ?? 0);
         }

         static now() {
            return fixedNow;
         }
      }

      Object.setPrototypeOf(MockDate, RealDate);
      globalThis.Date = MockDate as DateConstructor;
   }, FIXED_NOW_ISO);
}

async function installCachedLastWeek(page: Page) {
   await page.addInitScript(
      ({ cacheKey, week }) => {
         window.localStorage.setItem(
            cacheKey,
            JSON.stringify({
               data: week,
               weekNumber: week.week.number,
               weekStart: week.week.start,
            })
         );
      },
      {
         cacheKey: "roster-last-week-cache-v1",
         week: createRosterWeek(-1),
      }
   );
}

async function mockAppApis(page: Page) {
   let hasCustomToken = true;

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
         body: JSON.stringify({ hasCustomToken, hasBearerToken: hasCustomToken }),
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

function createRosterBatch(offset: number, limit: number) {
   return {
      offset,
      limit,
      hasMore: offset + limit < 50,
      weeks: Array.from({ length: limit }, (_, index) => createRosterWeek(offset + index)),
   };
}

function createRosterWeek(offset: number) {
   const startDate = new Date(`${WEEK_START_ISO}T00:00:00Z`);
   startDate.setUTCDate(startDate.getUTCDate() + offset * 7);
   const start = toIsoDate(startDate);
   const endDate = new Date(startDate.getTime() + 6 * MS_PER_DAY);
   const tuesday = new Date(startDate.getTime() + MS_PER_DAY);
   const tuesdayIso = toIsoDate(tuesday);

   return {
      week: {
         offset,
         number: 25 + offset,
         start,
         end: toIsoDate(endDate),
      },
      lessons: [
         {
            id: `lesson-${offset}-1`,
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
            id: `lesson-${offset}-2`,
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

function toIsoDate(date: Date) {
   return date.toISOString().slice(0, 10);
}
