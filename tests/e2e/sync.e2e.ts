import { expect, test, FIXED_NOW_ISO, installFixedClock, createRosterBatch, createShiftedRosterBatch } from "../support/app";

test("background sync retries quietly until the saved roster is stale and recovers without a warning flicker", async ({ page }) => {
   let fail = false;
   let attempts = 0;
   await page.route("**/api/roster/weeks?*", (route) => {
      attempts += 1;
      if (fail) return route.fulfill({ status: 503, json: { error: "Unavailable", retryable: true } });
      const url = new URL(route.request().url());
      const batch = createRosterBatch(Number(url.searchParams.get("offset")), Number(url.searchParams.get("limit")));
      batch.fetchedAt = new Date(FIXED_NOW_ISO).getTime();
      return route.fulfill({ json: batch });
   });
   await page.goto("/");
   await expect(page.locator(".grid-class").first()).toBeVisible();
   await expect.poll(() => attempts).toBe(2);
   await page.clock.install({ time: new Date(FIXED_NOW_ISO) });
   fail = true;
   await page.evaluate(() => window.dispatchEvent(new Event("online")));
   await expect.poll(() => attempts).toBe(3);
   await expect(page.getByText(/Showing your saved timetable/)).toHaveCount(0);
   await expect(page.getByText("Something went wrong while loading the roster.")).toHaveCount(0);
   await page.clock.fastForward(17_000);
   await expect.poll(() => attempts).toBeGreaterThanOrEqual(4);
   await expect(page.getByText(/Showing your saved timetable/)).toHaveCount(0);
   await page.clock.fastForward(15 * 60_000);
   await expect(page.getByText(/Showing your saved timetable/)).toBeVisible();
   await expect(page.locator(".grid-class").first()).toBeVisible();
   fail = false;
   await page.getByRole("button", { name: "Try again", exact: true }).click();
   await expect(page.getByText(/Showing your saved timetable/)).toHaveCount(0);
});

test("reloads cleanly when the server changes the roster time zone", async ({ page }) => {
   await page.addInitScript(() => window.localStorage.setItem("roster-time-zone-v1", "America/New_York"));
   await page.goto("/");

   await expect(page.getByRole("button", { name: "SOURCE_TITLE_0_1" })).toBeVisible();
   await expect.poll(() => page.evaluate(() => window.localStorage.getItem("roster-time-zone-v1"))).toBe("Europe/Amsterdam");
});

test("an aborted credential request cannot restore stale roster data", async ({ page }) => {
   let tokenVersion = 1;
   let releaseInitialRequest: () => void = () => undefined;
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
         body: JSON.stringify({
            hasCustomToken: tokenVersion > 0,
            hasBearerToken: tokenVersion > 0,
            contextId: tokenVersion > 0 ? "test-context" : null,
            ...(method === "PUT"
               ? {
                    verifiedBatch: {
                       ...createRosterBatch(0, 5),
                       weeks: createRosterBatch(0, 5).weeks.map((week) => ({
                          ...week,
                          classes: week.classes.map((item, index) => ({ ...item, title: index === 0 ? `TOKEN_${tokenVersion}_TITLE` : item.title })),
                       })),
                    },
                 }
               : {}),
         }),
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
      const firstLesson = batch.weeks[0]?.classes[0];
      if (firstLesson) {
         firstLesson.title = `TOKEN_${requestedTokenVersion}_TITLE`;
      }
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(batch) });
   });

   await page.goto("/");
   await page.getByRole("button", { name: "Open settings" }).click();
   await page.getByRole("region", { name: "Roster access" }).getByRole("button", { name: "Remove" }).click();
   await page.getByRole("button", { name: "Remove token" }).click();
   await expect(page.getByText("No bearer token is set.")).toBeVisible();

   releaseInitialRequest();
   await expect(page.getByRole("button", { name: "TOKEN_1_TITLE" })).toHaveCount(0);

   const settings = page.getByRole("dialog", { name: "Preferences" });
   const tokenInput = settings.getByLabel("Bearer token");
   const saveButton = settings.getByRole("button", { name: "Save" });
   await tokenInput.fill("Bearer fresh-token");
   await expect(tokenInput).toHaveValue("Bearer fresh-token");
   await expect(saveButton).toBeEnabled();
   await saveButton.click();
   await expect(page.locator(".grid-class", { hasText: "TOKEN_2_TITLE" })).toBeVisible({ timeout: 10_000 });
   await settings.getByRole("button", { name: "Close settings" }).click();

   await expect(page.getByRole("button", { name: "TOKEN_2_TITLE" })).toBeVisible();
   await expect(page.getByRole("button", { name: "TOKEN_1_TITLE" })).toHaveCount(0);
});

test("switching credentials in another tab discards account data and diff history", async ({ page, context }) => {
   await page.unroute("**/api/settings/osiris-token");
   await page.unroute("**/api/roster/weeks?*");
   let account = "A";
   await context.route("**/api/settings/osiris-token", async (route) => {
      if (route.request().method() === "PUT") account = (route.request().postDataJSON() as { token: string }).token.endsWith("-b") ? "B" : "A";
      const batch = createRosterBatch(0, 5);
      batch.contextId = account;
      batch.weeks.forEach((week) =>
         week.classes.forEach((item) => {
            item.id = account + item.id;
            item.title = account + item.title;
         })
      );
      await route.fulfill({
         json: { hasCustomToken: true, hasBearerToken: true, contextId: account, ...(route.request().method() === "PUT" ? { verifiedBatch: batch } : {}) },
      });
   });
   await context.route("**/api/roster/config", (route) => route.fulfill({ json: { timeZone: "Europe/Amsterdam" } }));
   await context.route("**/api/roster/weeks?*", async (route) => {
      const url = new URL(route.request().url());
      const batch = createRosterBatch(Number(url.searchParams.get("offset")), Number(url.searchParams.get("limit")));
      batch.contextId = account;
      batch.weeks.forEach((week) =>
         week.classes.forEach((item) => {
            item.id = account + item.id;
            item.title = account + item.title;
         })
      );
      await route.fulfill({ json: batch });
   });
   await page.goto("/");
   await expect(page.locator(".grid-class").first()).toContainText("ASOURCE");
   await page.getByRole("button", { name: "Open settings" }).click();
   await page.getByRole("dialog", { name: "Preferences" }).getByLabel("Bearer token").fill("Bearer account-a");
   await page.getByRole("button", { name: "Save", exact: true }).click();
   await expect(page.getByRole("dialog", { name: "Preferences" }).getByLabel("Bearer token")).toHaveValue("");
   await page.getByRole("dialog", { name: "Preferences" }).getByRole("button", { name: "Close settings", exact: true }).click();
   const second = await context.newPage();
   await installFixedClock(second);
   await second.goto("/");
   await expect(second.locator(".grid-class").first()).toContainText("ASOURCE");
   await second.getByRole("button", { name: "Open settings" }).click();
   await second.getByRole("dialog", { name: "Preferences" }).getByLabel("Bearer token").fill("Bearer account-b");
   await second.getByRole("button", { name: "Save", exact: true }).click();
   await expect(page.locator(".grid-class").first()).toContainText("BSOURCE");
   await expect(page.locator(".grid-class", { hasText: "ASOURCE" })).toHaveCount(0);
   await expect(page.locator(".grid-class.status-added,.grid-class.status-cancelled")).toHaveCount(0);
   await expect(page.getByRole("heading", { name: "Checking bearer token" })).toHaveCount(0);
   await second.close();
});

test("configuration recovers on an online event and has a manual retry action", async ({ page }) => {
   let available = false;
   await page.route("**/api/roster/config", (route) =>
      route.fulfill(available ? { json: { timeZone: "Europe/Amsterdam" } } : { status: 503, json: { error: "Unavailable" } })
   );
   await page.goto("/");
   await expect(page.getByText("Roster configuration unavailable", { exact: true })).toBeVisible();
   await expect(page.getByRole("button", { name: "Try again", exact: true })).toBeVisible();
   available = true;
   await page.evaluate(() => window.dispatchEvent(new Event("online")));
   await expect(page.locator(".grid-class").first()).toBeVisible();
});

test("downloaded future weeks survive a reload while roster requests are offline", async ({ page }) => {
   await page.goto("/");
   await expect(page.locator(".grid-class").first()).toBeVisible();
   await page.keyboard.press("3");
   await expect(page.locator(".grid-class").first()).toContainText("SOURCE_TITLE_3_1");
   await page.route("**/api/roster/weeks?*", (route) => route.abort());
   await page.reload();
   await expect(page.locator(".grid-class").first()).toBeVisible();
   await page.keyboard.press("3");
   await expect(page.locator(".grid-class").first()).toContainText("SOURCE_TITLE_3_1");
});

test("Sunday changes remain in the previous week after a Monday reload", async ({ page }) => {
   let removed = false;
   let monday = false;
   await page.route("**/api/roster/weeks?*", (route) => {
      const url = new URL(route.request().url());
      const offset = Number(url.searchParams.get("offset"));
      const batch = createRosterBatch(offset + (monday ? 1 : 0), Number(url.searchParams.get("limit")));
      batch.offset = offset;
      batch.weeks.forEach((week) => {
         if (week.week.start === "2026-06-22" || (removed && week.week.start === "2026-06-15")) week.classes = [];
         if (monday) week.week.offset -= 1;
      });
      return route.fulfill({ json: batch });
   });
   await page.addInitScript(() => {
      localStorage.setItem("test-clock", localStorage.getItem("test-clock") ?? "2026-06-21T23:55:00+02:00");
      localStorage.setItem("roster-shown-weekdays", "1,2,3,4,5,6,7");
   });
   await page.goto("/");
   await expect(page.getByRole("button", { name: "SOURCE_TITLE_0_1" })).toBeVisible();
   removed = true;
   await page.evaluate(() => window.dispatchEvent(new Event("online")));
   await expect(page.locator(".grid-class.status-cancelled")).toHaveCount(2);
   monday = true;
   await page.evaluate(() => localStorage.setItem("test-clock", "2026-06-22T00:05:00+02:00"));
   await page.reload();
   await expect(page.getByRole("heading", { name: /Week 26:/ })).toBeVisible();
   await expect(page.locator(".grid-class")).toHaveCount(0);
   await page.getByRole("button", { name: "Previous week" }).click();
   await expect(page.locator(".grid-class.status-cancelled")).toHaveCount(2);
});

test("next-week source data remains instantly available from cache during a failed reload", async ({ page }) => {
   let offline = false;
   await page.route("**/api/roster/weeks?*", (route) => {
      if (offline) return route.fulfill({ status: 503, json: { error: "Temporarily unavailable", retryable: true } });
      const url = new URL(route.request().url());
      const batch = createShiftedRosterBatch(Number(url.searchParams.get("offset")), Number(url.searchParams.get("limit")), 1);
      batch.fetchedAt = new Date(FIXED_NOW_ISO).getTime();
      return route.fulfill({ json: batch });
   });
   await page.goto("/");
   await expect(page.getByRole("button", { name: "SOURCE_TITLE_1_1" })).toBeVisible();
   offline = true;
   const failedRefresh = page.waitForResponse((response) => response.url().includes("/api/roster/weeks?offset=0") && response.status() === 503);
   await page.reload();
   await failedRefresh;
   await expect(page.locator(".weekbar__label")).toHaveText("Next week");
   await expect(page.getByRole("button", { name: "SOURCE_TITLE_1_1" })).toBeVisible();
   await expect(page.getByText(/Fetching your latest roster went wrong/)).toHaveCount(0);
});

test("an advanced source discovered by prefetch still exposes the active request failure", async ({ page }) => {
   let releaseActive: (() => void) | undefined;
   const release = new Promise<void>((resolve) => {
      releaseActive = resolve;
   });
   await page.route("**/api/roster/weeks?*", async (route) => {
      const url = new URL(route.request().url());
      const offset = Number(url.searchParams.get("offset"));
      if (offset === 0) {
         await release;
         return route.fulfill({ status: 503, json: { error: "Active batch unavailable" } });
      }
      return route.fulfill({ json: createShiftedRosterBatch(offset, Number(url.searchParams.get("limit")), 1) });
   });
   await page.goto("/");
   releaseActive?.();
   await expect(page.getByRole("alert").getByRole("heading", { name: "Could not load your roster." })).toBeVisible();
   await page.getByText("Error log", { exact: true }).click();
   await expect(page.getByRole("alert")).toContainText("Active batch unavailable");
});

test("an older overlapping batch cannot overwrite a newer week refresh", async ({ page }) => {
   const baseline = Date.now();
   let refreshing = false;
   let releaseOlder: (() => void) | undefined;
   const olderGate = new Promise<void>((resolve) => {
      releaseOlder = resolve;
   });
   await page.route("**/api/roster/weeks?*", async (route) => {
      const url = new URL(route.request().url());
      const offset = Number(url.searchParams.get("offset"));
      const batch = createShiftedRosterBatch(offset, Number(url.searchParams.get("limit")), 1);
      batch.fetchedAt = baseline;
      if (refreshing && offset === 0) {
         await olderGate;
         batch.fetchedAt = baseline + 1000;
         const schoolClass = batch.weeks.find((week) => week.week.start === "2026-07-20")?.classes[0];
         if (schoolClass) schoolClass.room = "STALE_ROOM";
      }
      if (refreshing && offset === 4) {
         batch.fetchedAt = baseline + 2000;
         const schoolClass = batch.weeks[0]?.classes[0];
         if (schoolClass) schoolClass.room = "FRESH_ROOM";
      }
      return route.fulfill({ json: batch });
   });
   await page.goto("/");
   await expect(page.getByRole("button", { name: "SOURCE_TITLE_1_1" })).toBeVisible();
   await page.keyboard.press("5");
   await expect(page.getByRole("button", { name: "SOURCE_TITLE_5_1" })).toBeVisible();
   refreshing = true;
   await page.evaluate(() => window.dispatchEvent(new Event("online")));
   await expect(page.getByRole("button", { name: "SOURCE_TITLE_5_1" })).toContainText("FRESH_ROOM");
   const olderResponse = page.waitForResponse((response) => response.url().includes("/api/roster/weeks?offset=0&"));
   releaseOlder?.();
   await olderResponse;
   await expect
      .poll(() =>
         page.evaluate(() => {
            const cache = JSON.parse(localStorage.getItem("roster-weeks-v3") ?? "{}") as {
               weeks?: { data: { week: { start: string }; classes: { room: string }[] }; fetchedAt: number }[];
            };
            const week = cache.weeks?.find((item) => item.data.week.start === "2026-07-20");
            const olderWeek = cache.weeks?.find((item) => item.data.week.start === "2026-06-22");
            return { fetchedAt: week?.fetchedAt, room: week?.data.classes[0]?.room, olderFetchedAt: olderWeek?.fetchedAt };
         })
      )
      .toEqual({ fetchedAt: baseline + 2000, room: "FRESH_ROOM", olderFetchedAt: baseline + 1000 });
   await expect(page.locator(".weekbar__label")).toHaveText("In 5 weeks");
});
