import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const FIXED_NOW_ISO = "2026-06-16T09:45:00+02:00";
const WEEK_START_ISO = "2026-06-15";
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const OSIRIS_BEARER_TOKEN_HELP_URL = "https://youtu.be/MbcI61KIQbI";
const pageErrors = new WeakMap<Page, string[]>();

test.beforeEach(async ({ page }) => {
   const errors: string[] = [];
   pageErrors.set(page, errors);
   page.on("pageerror", (error) => errors.push(error.stack ?? error.message));
   await page.emulateMedia({ colorScheme: "dark" });
   await installFixedClock(page);
   await mockAppApis(page);
});

test.afterEach(({ page }) => {
   expect(pageErrors.get(page) ?? []).toEqual([]);
});

test("week navigation and view controls work with mocked roster data", async ({ page }) => {
   await installCachedLastWeek(page);
   await page.goto("/");

   await expect(page.getByRole("heading", { name: /Week 25:/ })).toBeVisible();
   await expect(page.locator(".app-toolbar__identity .eyebrow")).toHaveCount(0);
   await expect(page.getByRole("button", { name: "Previous week" })).toBeEnabled();
   await expect(page.getByRole("button", { name: "Next week" })).toBeEnabled();
   await expect(page.locator(".grid-class", { hasText: "SOURCE_TITLE_0_1" })).toBeVisible();

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

   // Space must not be stolen from focused controls, so blur the week button before using the jump shortcut.
   await page.evaluate(() => (document.activeElement instanceof HTMLElement ? document.activeElement.blur() : undefined));
   await page.keyboard.press("Space");
   await expect(page.locator(".weekbar__label")).toHaveText("This week");
   await expect(page.getByRole("heading", { name: /Week 25:/ })).toBeVisible();

   await page.getByRole("button", { name: "Grid view" }).click();
   await expect(page.locator(".grid-shell")).toBeVisible();
   await expect(page.getByRole("radio", { name: "30m" })).toBeVisible();

   await page.getByRole("radio", { name: "30m" }).click();
   await expect(page.getByRole("radio", { name: "30m" })).toHaveAttribute("aria-checked", "true");

   await page.getByRole("button", { name: "Agenda view" }).click();
   await expect(page.locator(".agenda-view")).toBeVisible();
   await expect(page.getByRole("button", { name: "Collapse" })).toBeVisible();
});

test("prefetches the batch after the active batch", async ({ page }) => {
   const requestedOffsets = new Set<number>();
   page.on("request", (request) => {
      if (!request.url().includes("/api/roster/weeks?")) {
         return;
      }

      requestedOffsets.add(Number(new URL(request.url()).searchParams.get("offset")));
   });

   await page.goto("/");

   await expect(page.getByRole("heading", { name: /Week 25:/ })).toBeVisible();
   await expect.poll(() => [...requestedOffsets].sort((left, right) => left - right)).toEqual([0, 5]);

   await page.keyboard.press("5");
   await expect(page.locator(".weekbar__label")).toHaveText("In 5 weeks");
   await expect.poll(() => [...requestedOffsets].sort((left, right) => left - right)).toEqual([0, 5, 10]);
});

test("holding a week arrow keeps advancing through the roster", async ({ page }) => {
   await page.goto("/");

   await page.keyboard.down("ArrowRight");
   await expect(page.locator(".weekbar__label")).toHaveText("Next week");
   await expect
      .poll(() => page.evaluate(() => document.getAnimations().map((animation) => (animation instanceof CSSAnimation ? animation.animationName : ""))))
      .toEqual(expect.arrayContaining(["roster-week-out-left", "roster-week-in-right"]));
   await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).viewTransitionName)).toBe("none");
   await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement, "::view-transition").pointerEvents)).toBe("none");
   // The label moves on every repeat, so assert the distance travelled instead of a transient value.
   await expect
      .poll(async () => {
         const weeks = /In (\d+) weeks?/.exec((await page.locator(".weekbar__label").textContent()) ?? "");
         return weeks ? Number(weeks[1]) : 0;
      })
      .toBeGreaterThanOrEqual(3);
   await page.keyboard.up("ArrowRight");
   // The last repeat's commit lands a frame or two after keyup when the transition callback is
   // delayed, so wait for the week transition itself to finish before reading where the hold stopped.
   // Other page animations linger forever, so only the transition's own keyframes count as in-flight.
   await expect
      .poll(() =>
         page.evaluate(
            () =>
               document.getAnimations().filter((animation) => {
                  const name = animation instanceof CSSAnimation ? animation.animationName : "";
                  return name.startsWith("roster-week") || name.startsWith("view-enter");
               }).length
         )
      )
      .toBe(0);
   await expect(page.locator(".app-content-frame")).toHaveAttribute("data-week-transition", "settled");

   const releasedWeek = await page.locator(".weekbar__label").textContent();
   await page.waitForTimeout(550);
   await expect(page.locator(".weekbar__label")).toHaveText(releasedWeek ?? "");
});

test("week buttons accept another click before their transition finishes", async ({ page }) => {
   await page.goto("/");

   const nextWeek = page.getByRole("button", { name: "Next week", exact: true });
   for (const label of ["Next week", "In 2 weeks", "In 3 weeks"]) {
      await nextWeek.click();
      await expect(page.locator(".weekbar__label")).toHaveText(label);
   }
   await expect
      .poll(() => page.evaluate(() => document.getAnimations().map((animation) => (animation instanceof CSSAnimation ? animation.animationName : ""))))
      .toEqual(expect.arrayContaining(["roster-week-out-left", "roster-week-in-right"]));

   const previousWeek = page.getByRole("button", { name: "Previous week", exact: true });
   for (const label of ["In 2 weeks", "Next week", "This week"]) {
      await previousWeek.click();
      await expect(page.locator(".weekbar__label")).toHaveText(label);
   }
});

test("week swipe uses the same directional content transition", async ({ page }) => {
   await page.goto("/");

   await swipeWeek(page, "next");
   await expect(page.locator(".weekbar__label")).toHaveText("Next week");
   await expect
      .poll(() => page.evaluate(() => document.getAnimations().map((animation) => (animation instanceof CSSAnimation ? animation.animationName : ""))))
      .toEqual(expect.arrayContaining(["roster-week-out-left", "roster-week-in-right"]));

   await swipeWeek(page, "previous");
   await expect(page.locator(".weekbar__label")).toHaveText("This week");
   await expect
      .poll(() => page.evaluate(() => document.getAnimations().map((animation) => (animation instanceof CSSAnimation ? animation.animationName : ""))))
      .toEqual(expect.arrayContaining(["roster-week-out-right", "roster-week-in-left"]));
});

test("shift and an arrow moves by one roster batch", async ({ page }) => {
   await page.goto("/");

   await page.keyboard.press("Shift+ArrowRight");
   await expect(page.locator(".weekbar__label")).toHaveText("In 5 weeks");

   await page.keyboard.press("Shift+ArrowLeft");
   await expect(page.locator(".weekbar__label")).toHaveText("This week");
});

test("defaults to grid on desktop when no roster view was saved", async ({ page }) => {
   await page.setViewportSize({ width: 1280, height: 720 });
   await page.goto("/");

   await expect(page.locator(".grid-shell")).toBeVisible();
   await expect(page.getByRole("button", { name: "Grid view" })).toHaveAttribute("aria-pressed", "true");
});

test("defaults to agenda on mobile when no roster view was saved", async ({ page }) => {
   await page.setViewportSize({ width: 390, height: 844 });
   await page.goto("/");

   await expect(page.locator(".agenda-view")).toBeVisible();
   await expect(page.getByRole("button", { name: "Agenda view" })).toHaveAttribute("aria-pressed", "true");
});

test("toolbar controls and shortcuts invoke the same actions", async ({ page }) => {
   await page.goto("/");

   await page.getByRole("button", { name: "Agenda view" }).click();
   await expect(page.locator(".agenda-view")).toBeVisible();
   await page.keyboard.press("g");
   await expect(page.locator(".grid-shell")).toBeVisible();
   await page.keyboard.press("a");
   await expect(page.locator(".agenda-view")).toBeVisible();

   const dayHeaders = page.locator(".day-group__header");
   await page.getByRole("button", { name: "Collapse" }).click();
   await expect(page.locator('.day-group__header[aria-expanded="true"]')).toHaveCount(0);
   await page.keyboard.press("Control+1");
   await expect(page.locator('.day-group__header[aria-expanded="true"]')).toHaveCount(await dayHeaders.count());

   await page.keyboard.press("g");
   await page.getByRole("radio", { name: "30m" }).click();
   await expect(page.getByRole("radio", { name: "30m" })).toHaveAttribute("aria-checked", "true");
   await page.keyboard.press("Control+1");
   await expect(page.getByRole("radio", { name: "1h" })).toHaveAttribute("aria-checked", "true");

   await page.keyboard.press("i");
   await expect(page.getByRole("dialog", { name: "Preferences" })).toBeVisible();
});

test("keeps a saved roster view over the viewport default", async ({ page }) => {
   await page.setViewportSize({ width: 390, height: 844 });
   await page.addInitScript(() => {
      window.localStorage.setItem("roster-view-mode", "grid");
   });
   await page.goto("/");

   await expect(page.locator(".grid-shell")).toBeVisible();
   await expect(page.getByRole("button", { name: "Grid view" })).toHaveAttribute("aria-pressed", "true");
});

test("mobile grid fits its viewport and week buttons remain repeatable", async ({ page }) => {
   await page.setViewportSize({ width: 390, height: 844 });
   await page.addInitScript(() => {
      window.localStorage.setItem("roster-view-mode", "grid");
   });
   await page.goto("/");

   await expect(page.locator(".grid-shell")).toBeVisible();
   await expect(page.locator(".overlay-scrollbar")).toHaveCount(0);

   const viewportMetrics = await page.evaluate(() => ({
      viewportHeight: window.visualViewport?.height ?? window.innerHeight,
      pageHeight: document.documentElement.scrollHeight,
      appHeight: document.getElementById("app")?.getBoundingClientRect().height ?? 0,
   }));
   expect(viewportMetrics.pageHeight).toBeLessThanOrEqual(Math.ceil(viewportMetrics.viewportHeight));
   expect(viewportMetrics.appHeight).toBeCloseTo(viewportMetrics.viewportHeight, 0);

   const nextWeek = page.getByRole("button", { name: "Next week", exact: true });
   for (const label of ["Next week", "In 2 weeks", "In 3 weeks"]) {
      await nextWeek.click();
      await expect(page.locator(".weekbar__label")).toHaveText(label);
   }

   await expect
      .poll(() => page.evaluate(() => document.getAnimations().map((animation) => (animation instanceof CSSAnimation ? animation.animationName : ""))))
      .toEqual(expect.arrayContaining(["roster-week-out-left", "roster-week-in-right"]));
   await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement, "::view-transition").pointerEvents)).toBe("none");
   await expect
      .poll(() =>
         page.evaluate(() => {
            const toolbar = document.querySelector<HTMLElement>(".mobile-bottom-bar");
            return toolbar ? getComputedStyle(toolbar).viewTransitionName : null;
         })
      )
      .toBe("none");
});

test("reloads cleanly when the server changes the roster time zone", async ({ page }) => {
   await page.addInitScript(() => window.localStorage.setItem("roster-time-zone-v1", "America/New_York"));
   await page.goto("/");

   await expect(page.getByRole("button", { name: "SOURCE_TITLE_0_1" })).toBeVisible();
   await expect.poll(() => page.evaluate(() => window.localStorage.getItem("roster-time-zone-v1"))).toBe("Europe/Amsterdam");
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

   await page.getByRole("group", { name: "Shown weekdays" }).getByRole("button", { name: "Sun", exact: true }).click();
   await expect(page.getByRole("group", { name: "Shown weekdays" }).getByRole("button", { name: "Sun", exact: true })).toHaveAttribute("aria-pressed", "true");

   const rosterAccess = page.getByRole("region", { name: "Roster access" });
   await rosterAccess.getByRole("button", { name: "Reset" }).click();
   await expect(page.getByRole("alertdialog", { name: "Reset bearer token?" })).toBeVisible();
   await page.getByRole("button", { name: "Reset token" }).click();
   await expect(page.getByRole("alertdialog", { name: "Reset bearer token?" })).toBeHidden();
   await expect(page.getByRole("dialog", { name: "Preferences" })).toBeVisible();
   await expect(page.getByText("No bearer token is set.")).toBeVisible();

   await page.locator(".settings-dialog__header").getByRole("button", { name: "Close settings" }).click();
   await expect(page.getByRole("dialog", { name: "Preferences" })).toBeHidden();
});

test("grid hours and agenda folding preferences control the timetable", async ({ page }) => {
   await page.addInitScript(() => window.localStorage.setItem("roster-grid-hours", "10,11"));
   await page.goto("/");

   const hiddenHoursWarning = page.getByRole("status").filter({ hasText: "2 classes are outside the grid's shown hours" });
   await expect(hiddenHoursWarning).toBeVisible();
   await hiddenHoursWarning.getByRole("button", { name: "Show 09:00–12:00" }).click();
   await expect(hiddenHoursWarning).toBeHidden();
   await expect.poll(() => page.evaluate(() => window.localStorage.getItem("roster-grid-hours"))).toBe("9,12");

   await page.getByRole("button", { name: "Open settings" }).click();
   const gridHours = page.getByRole("region", { name: "Grid hours" });
   await expect(gridHours.getByRole("slider", { name: "Grid start time" })).toHaveValue("9");
   await expect(gridHours.getByRole("slider", { name: "Grid end time" })).toHaveValue("12");
   await gridHours.getByRole("button", { name: "Default", exact: true }).click();
   await expect(gridHours.getByRole("slider", { name: "Grid start time" })).toHaveValue("8");
   await expect(gridHours.getByRole("slider", { name: "Grid end time" })).toHaveValue("18");
   await gridHours.getByRole("button", { name: "Smart", exact: true }).click();
   await expect(gridHours.getByRole("slider", { name: "Grid start time" })).toHaveValue("9");
   await expect(gridHours.getByRole("slider", { name: "Grid end time" })).toHaveValue("12");

   const folding = page.getByRole("region", { name: "Agenda folding" });
   await folding.getByRole("radio", { name: "All", exact: true }).click();
   await expect.poll(() => page.evaluate(() => window.localStorage.getItem("roster-agenda-folding"))).toBe("all");
   await page.locator(".settings-dialog__header").getByRole("button", { name: "Close settings" }).click();
   await page.getByRole("button", { name: "Agenda view" }).click();
   await expect(page.locator('.day-group__body[aria-hidden="false"]')).toHaveCount(5);
});

test("only the topmost dialog handles Escape and focus stays contained", async ({ page }) => {
   await page.goto("/");
   await page.getByRole("button", { name: "Open settings" }).click();
   const settings = page.getByRole("dialog", { name: "Preferences" });
   await expect(settings).toBeVisible();
   const closeSettingsButton = settings.getByRole("button", { name: "Close settings" });
   await expect(closeSettingsButton).toBeFocused();
   await page.keyboard.press("Shift+Tab");
   await expect(page.getByRole("switch", { name: "Enable devtools" })).toBeFocused();
   await page.keyboard.press("Tab");
   await expect(closeSettingsButton).toBeFocused();

   const resetTokenButton = settings.getByRole("region", { name: "Roster access" }).getByRole("button", { name: "Reset" });
   await resetTokenButton.click();
   const confirmation = page.getByRole("alertdialog", { name: "Reset bearer token?" });
   await expect(confirmation).toBeVisible();
   await page.keyboard.press("Escape");

   await expect(confirmation).toBeHidden();
   await expect(settings).toBeVisible();
   await expect(resetTokenButton).toBeFocused();
});

test("class change notifications are an explicit saved preference", async ({ page }) => {
   await page.addInitScript(() => {
      Object.defineProperty(window, "Notification", {
         configurable: true,
         value: {
            permission: "granted",
            requestPermission: () => Promise.resolve("granted"),
         },
      });
   });
   await page.goto("/");
   await page.getByRole("button", { name: "Open settings" }).click();

   const toggle = page.getByRole("switch", { name: "Notify me about class changes" });
   await expect(toggle).toHaveAttribute("aria-checked", "false");
   await toggle.click();
   await expect(toggle).toHaveAttribute("aria-checked", "true");
   await expect.poll(() => page.evaluate(() => window.localStorage.getItem("roster-class-notifications"))).toBe("true");

   await toggle.click();
   await expect(toggle).toHaveAttribute("aria-checked", "false");
   await expect.poll(() => page.evaluate(() => window.localStorage.getItem("roster-class-notifications"))).toBe("false");
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
   const tokenInput = settings.getByLabel("Bearer token");
   const saveButton = settings.getByRole("button", { name: "Save token" });
   await tokenInput.fill("Bearer replacement-token");
   await expect(tokenInput).toHaveValue("Bearer replacement-token");
   await expect(saveButton).toBeEnabled();
   const weekRefresh = page.waitForResponse((response) => response.url().includes("/api/roster/weeks?") && response.request().method() === "GET");
   await saveButton.click();
   await weekRefresh;

   await expect.poll(() => rosterRequestCount).toBeGreaterThan(initialRequestCount);
   await expect(settings).toBeVisible();
   await expect(page.locator(".grid-class", { hasText: "SOURCE_TITLE_0_1" })).toBeVisible();
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
      const firstLesson = batch.weeks[0]?.classes[0];
      if (firstLesson) {
         firstLesson.title = `TOKEN_${requestedTokenVersion}_TITLE`;
      }
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(batch) });
   });

   await page.goto("/");
   await page.getByRole("button", { name: "Open settings" }).click();
   await page.getByRole("region", { name: "Roster access" }).getByRole("button", { name: "Reset" }).click();
   await page.getByRole("button", { name: "Reset token" }).click();
   await expect(page.getByText("No bearer token is set.")).toBeVisible();

   releaseInitialRequest();
   await expect(page.getByRole("button", { name: "TOKEN_1_TITLE" })).toHaveCount(0);

   const settings = page.getByRole("dialog", { name: "Preferences" });
   const tokenInput = settings.getByLabel("Bearer token");
   const saveButton = settings.getByRole("button", { name: "Save token" });
   await tokenInput.fill("Bearer fresh-token");
   await expect(tokenInput).toHaveValue("Bearer fresh-token");
   await expect(saveButton).toBeEnabled();
   const freshRosterResponse = waitForRosterResponseTitle(page, "TOKEN_2_TITLE");
   await saveButton.click();
   await freshRosterResponse;
   await expect(page.locator(".grid-class", { hasText: "TOKEN_2_TITLE" })).toBeVisible({ timeout: 10_000 });
   await settings.getByRole("button", { name: "Close settings" }).click();

   await expect(page.getByRole("button", { name: "TOKEN_2_TITLE" })).toBeVisible();
   await expect(page.getByRole("button", { name: "TOKEN_1_TITLE" })).toHaveCount(0);
});

test("week swipe navigation is disabled while an overlay is open", async ({ page }) => {
   await page.goto("/");
   await page.getByRole("button", { name: "Open settings" }).click();

   await swipeWeek(page, "next");

   await expect(page.locator(".weekbar__label")).toHaveText("This week");
});

test("space activates a focused schoolClass instead of jumping to the current week", async ({ page }) => {
   await page.goto("/");
   const schoolClass = page.getByRole("button", { name: /SOURCE_TITLE_0_1/ });
   await schoolClass.focus();
   await page.keyboard.press("Space");

   await expect(page.getByRole("dialog", { name: "Class details" })).toBeVisible();
   await expect(page.locator(".weekbar__label")).toHaveText("This week");
});

test("collapsed agenda days remove hidden classes from keyboard navigation", async ({ page }) => {
   await page.goto("/");
   await page.getByRole("button", { name: "Agenda view" }).click();
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

test("tooltips work inside preferences and do not reopen after focus restoration", async ({ page }) => {
   await page.setViewportSize({ width: 1280, height: 720 });
   await page.goto("/");

   const settingsButton = page.getByRole("button", { name: "Open settings" });
   await settingsButton.hover();
   await expect(page.locator('.control-tooltip[data-open="true"]')).toContainText("Open settings");
   await settingsButton.click();

   const defaultDaysButton = page.getByRole("region", { name: "Shown days" }).getByRole("button", { name: "Default", exact: true });
   await defaultDaysButton.hover();
   const preferencesTooltip = page.locator('.settings-dialog .control-tooltip[data-open="true"]');
   await expect(preferencesTooltip).toContainText("Show Monday through Friday");
   await expect(preferencesTooltip).toBeVisible();

   await page.locator(".settings-dialog__header").getByRole("button", { name: "Close settings" }).click();
   await expect(page.getByRole("dialog", { name: "Preferences" })).toBeHidden();
   await page.waitForTimeout(600);
   await expect(page.locator('.control-tooltip[data-open="true"]')).toHaveCount(0);
});

test("a fresh theme follows the system color scheme", async ({ page }) => {
   await page.emulateMedia({ colorScheme: "light" });
   await page.goto("/");

   await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
   await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute("content", "#f9fbfe");
});

test("the theme picker returns to the active theme when reopened", async ({ page }) => {
   await page.goto("/");
   await page.getByRole("button", { name: "Open settings" }).click();
   await page.getByRole("radio", { name: "Light", exact: true }).click();
   await expect(page.getByRole("button", { name: "Light", exact: true })).toBeVisible();

   await page.locator(".settings-dialog__header").getByRole("button", { name: "Close settings" }).click();
   await page.getByRole("button", { name: "Open settings" }).click();

   await expect(page.getByRole("radio", { name: "Dark", exact: true })).toHaveAttribute("aria-checked", "true");
   await expect(page.getByRole("button", { name: "Dark", exact: true })).toHaveAttribute("aria-pressed", "true");
});

test("time indicators are visible and positioned for the fixed current time", async ({ page }) => {
   await page.goto("/");

   await page.getByRole("button", { name: "Agenda view" }).click();
   const agendaIndicator = page.locator(".agenda-current-indicator");
   await expect(agendaIndicator).toBeVisible();
   await expect(agendaIndicator).toHaveAttribute("data-visible", "true");
   await expect(agendaIndicator.locator(".agenda-current-indicator__progress")).toHaveCSS("height", /1[0-9]|2[0-9]|3[0-9]|4[0-9]|5[0-9]/);

   await page.getByRole("button", { name: "Grid view" }).click();
   const gridNowLine = page.locator(".grid-now-line");
   await expect(gridNowLine).toBeVisible();

   const top = await gridNowLine.evaluate((element) => Number.parseFloat((element as HTMLElement).style.top));
   expect(top).toBeGreaterThan(17);
   expect(top).toBeLessThan(18);
});

test("timeline zoom supports radio-group arrow navigation", async ({ page }) => {
   await page.goto("/");
   const hourZoom = page.getByRole("radio", { name: "1h" });
   const halfHourZoom = page.getByRole("radio", { name: "30m" });
   await hourZoom.focus();
   await page.keyboard.press("ArrowRight");

   await expect(halfHourZoom).toBeFocused();
   await expect(halfHourZoom).toHaveAttribute("aria-checked", "true");
   await expect(page.locator(".weekbar__label")).toHaveText("This week");
});

test("schoolClass dialogs isolate the app and lock mobile page scrolling", async ({ page }) => {
   await page.setViewportSize({ width: 390, height: 500 });
   await page.goto("/");
   await page.getByRole("button", { name: /SOURCE_TITLE_0_1/ }).click();
   await expect(page.getByRole("dialog")).toBeVisible();
   await expect(page.locator("#app")).toHaveAttribute("inert", "");
   await expect(page.locator("#app")).toHaveAttribute("aria-hidden", "true");

   const initialScrollY = await page.evaluate(() => window.scrollY);
   await page.mouse.move(380, 250);
   await page.mouse.wheel(0, 800);
   await page.waitForTimeout(100);
   expect(await page.evaluate(() => window.scrollY)).toBe(initialScrollY);

   await page.getByRole("dialog").getByRole("button", { name: "Close", exact: true }).click();
   await expect(page.getByRole("dialog")).toBeHidden();
   await expect(page.locator("#app")).not.toHaveAttribute("inert", "");
   await expect(page.locator("#app")).toHaveAttribute("aria-hidden", "false");
});

test("grid classes expose day, time, teacher, and place in their accessible names", async ({ page }) => {
   await page.goto("/");
   await expect(page.getByRole("region", { name: "Weekly timetable grid" })).toBeVisible();
   await expect(
      page.getByRole("button", {
         name: /SOURCE_TITLE_0_1, SOURCE_SUBJECT_0_1, Tuesday 16 June, 09:00-10:30, SOURCE_TEACHER, SOURCE_ROOM/,
      })
   ).toBeVisible();
});

test("core timetable and dialog surfaces pass automated accessibility checks", async ({ page }) => {
   await page.goto("/");
   const timetableResults = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
   expect(timetableResults.violations).toEqual([]);

   await page.getByRole("button", { name: "Open settings" }).click();
   const dialogResults = await new AxeBuilder({ page }).include(".settings-dialog").withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
   expect(dialogResults.violations).toEqual([]);
});

test("every theme keeps text contrast and status colors distinct", async ({ page, browserName }) => {
   test.skip(browserName !== "chromium", "One browser is enough for deterministic computed-color checks.");

   const themesByMode = {
      Dark: ["Dark", "Frost", "Espresso", "Moss", "Dusk", "Ember", "Abyss", "Noir", "Contrast"],
      Light: ["Light", "Thaw", "Latte", "Ivy", "Dawn", "Flare", "Bloom", "Paper", "Osiris"],
   } as const;

   await page.goto("/");
   await page.getByRole("button", { name: "Open settings" }).click();

   for (const [mode, themes] of Object.entries(themesByMode)) {
      await page.getByRole("radio", { name: mode, exact: true }).click();

      for (const theme of themes) {
         await page.getByRole("button", { name: theme, exact: true }).click();
         const results = await new AxeBuilder({ page }).include(".settings-dialog").withRules(["color-contrast"]).analyze();
         expect(results.violations, `${theme} should pass text contrast checks`).toEqual([]);

         const semanticColors = await page.evaluate(() => {
            const style = getComputedStyle(document.documentElement);
            const parseRgb = (property: string) => style.getPropertyValue(property).split(",").map(Number);
            return {
               content: [parseRgb("--accent-rgb"), parseRgb("--warning-rgb")],
               chrome: [parseRgb("--chrome-accent-rgb"), parseRgb("--chrome-warning-rgb")],
            };
         });

         for (const [scope, [accent, warning]] of Object.entries(semanticColors)) {
            const distance = Math.hypot(...accent.map((channel, index) => channel - warning[index]));
            expect(distance, `${theme} ${scope} warning should be visibly different from its accent`).toBeGreaterThanOrEqual(70);
         }
      }
   }
});

test("desktop grid and mobile agenda match their visual baselines", async ({ page, browserName }) => {
   test.skip(browserName !== "chromium", "Visual baselines use Chromium for deterministic rendering.");

   await page.setViewportSize({ width: 1280, height: 720 });
   await page.goto("/");
   await page.evaluate(() => document.fonts.ready);
   await expect(page.locator(".shell")).toHaveScreenshot("desktop-grid.png", { animations: "disabled" });

   await page.setViewportSize({ width: 390, height: 844 });
   await page.getByRole("button", { name: "Agenda view" }).click();
   await expect(page.locator(".shell")).toHaveScreenshot("mobile-agenda.png", { animations: "disabled" });
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
      ({ cacheKey, timeZoneKey, timeZone, week }) => {
         window.localStorage.setItem(timeZoneKey, timeZone);
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
         timeZoneKey: "roster-time-zone-v1",
         timeZone: "Europe/Amsterdam",
         week: createWeek(-1),
      }
   );
}

async function swipeWeek(page: Page, direction: "previous" | "next") {
   await page.evaluate((swipeDirection) => {
      const target = document.body;
      const startX = swipeDirection === "next" ? 320 : 120;
      const endX = swipeDirection === "next" ? 120 : 320;
      const start = { identifier: 1, target, clientX: startX, clientY: 300 };
      const end = { identifier: 1, target, clientX: endX, clientY: 300 };
      const startEvent = new Event("touchstart");
      const endEvent = new Event("touchend");
      Object.defineProperty(startEvent, "touches", { value: [start] });
      Object.defineProperty(endEvent, "changedTouches", { value: [end] });
      window.dispatchEvent(startEvent);
      window.dispatchEvent(endEvent);
   }, direction);
}

async function mockAppApis(page: Page) {
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
      timeZone: "Europe/Amsterdam",
      weeks: Array.from({ length: limit }, (_, index) => createWeek(offset + index)),
   };
}

function createWeek(offset: number) {
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

function toIsoDate(date: Date) {
   return date.toISOString().slice(0, 10);
}

function waitForRosterResponseTitle(page: Page, expectedTitle: string) {
   return page.waitForResponse(async (response) => {
      if (!response.url().includes("/api/roster/weeks?") || response.request().method() !== "GET") {
         return false;
      }

      const payload = (await response.json()) as { weeks?: { classes?: { title?: string }[] }[] };
      return payload.weeks?.[0]?.classes?.[0]?.title === expectedTitle;
   });
}
