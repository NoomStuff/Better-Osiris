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

test("defaults to grid on desktop when no roster view was saved", async ({ page }) => {
   await page.setViewportSize({ width: 1280, height: 720 });
   await page.goto("/");

   await expect(page.locator(".grid-shell")).toBeVisible();
   await expect(page.getByRole("button", { name: "Grid view" })).toHaveAttribute("aria-pressed", "true");
});

test("uses the bundled Quicksand variable font", async ({ page }) => {
   await page.goto("/");
   await page.evaluate(() => document.fonts.ready);

   const fontState = await page.evaluate(() => ({
      computedFamily: getComputedStyle(document.body).fontFamily,
      loaded: [...document.fonts].some((font) => font.family.includes("Quicksand Variable") && font.status === "loaded"),
   }));
   expect(fontState.computedFamily).toContain("Quicksand Variable");
   // WebKit can resolve fonts.ready before the FontFace is marked loaded, so poll instead of asserting once.
   await expect
      .poll(() => page.evaluate(() => [...document.fonts].some((font) => font.family.includes("Quicksand Variable") && font.status === "loaded")))
      .toBe(true);
});

test("defaults to agenda on mobile when no roster view was saved", async ({ page }) => {
   await page.setViewportSize({ width: 390, height: 844 });
   await page.goto("/");

   await expect(page.locator(".agenda-view")).toBeVisible();
   await expect(page.getByRole("button", { name: "Agenda view" })).toHaveAttribute("aria-pressed", "true");
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

   await page.evaluate(() => {
      const target = document.body;
      const start = { identifier: 1, target, clientX: 320, clientY: 300 };
      const end = { identifier: 1, target, clientX: 120, clientY: 300 };
      const startEvent = new Event("touchstart");
      const endEvent = new Event("touchend");
      Object.defineProperty(startEvent, "touches", { value: [start] });
      Object.defineProperty(endEvent, "changedTouches", { value: [end] });
      window.dispatchEvent(startEvent);
      window.dispatchEvent(endEvent);
   });

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

test("devtools can preview changed and cancelled schoolClass states", async ({ page }) => {
   await page.goto("/");

   await page.getByRole("button", { name: "Agenda view" }).click();
   await page.getByRole("button", { name: "Open settings" }).click();
   await page.getByLabel("Enable devtools").check();
   await page.getByRole("button", { name: "Mixed" }).click();
   await page.locator(".settings-dialog__header").getByRole("button", { name: "Close settings" }).click();

   await expect(page.locator(".agenda-class.status-changed")).toHaveCount(1);
   await expect(page.locator(".agenda-class.status-cancelled")).toHaveCount(1);

   await page.getByRole("button", { name: /SOURCE_TITLE_0_1/ }).click();
   await expect(page.locator(".class-panel__status--changed")).toHaveText("changed");
   const roomDetails = page.locator(".class-panel__details > div", { has: page.locator("dt", { hasText: "Room" }) });
   await expect(roomDetails.locator("s")).toHaveText("A101");
   await expect(roomDetails.locator("strong")).toHaveText("SOURCE_ROOM");
   await expect(page.locator(".class-panel__details dt", { hasText: "Date" })).toHaveCount(1);
   await expect(page.locator(".class-panel__details dt", { hasText: "Time" })).toHaveCount(1);
   await expect(page.locator(".class-panel__details dt", { hasText: "Status" })).toHaveCount(0);
   await page.locator(".class-panel__header").getByRole("button", { name: "Close", exact: true }).click();

   await page.getByRole("button", { name: /SOURCE_TITLE_0_2/ }).click();
   await expect(page.locator(".class-panel__status--cancelled")).toHaveText("cancelled");
   await expect(page.locator(".class-panel__details dt", { hasText: "Status" })).toHaveCount(0);
});

test("devtools can preview an added schoolClass state", async ({ page }) => {
   await page.goto("/");

   await page.getByRole("button", { name: "Agenda view" }).click();
   await page.getByRole("button", { name: "Open settings" }).click();
   await page.getByLabel("Enable devtools").check();
   await page.getByRole("button", { name: "Added", exact: true }).click();
   await page.locator(".settings-dialog__header").getByRole("button", { name: "Close settings" }).click();

   await expect(page.locator(".agenda-class.status-added")).toHaveCount(1);
   await page.getByRole("button", { name: /SOURCE_TITLE_0_1/ }).click();
   await expect(page.locator(".class-panel__status--added")).toHaveText("added");
   await expect(page.locator(".class-panel__change-values")).toHaveCount(0);
});

test("tooltips work inside preferences and do not reopen after focus restoration", async ({ page }) => {
   await page.setViewportSize({ width: 1280, height: 720 });
   await page.goto("/");

   const settingsButton = page.getByRole("button", { name: "Open settings" });
   await settingsButton.hover();
   await expect(page.locator('.control-tooltip[data-open="true"]')).toContainText("Open settings");
   await settingsButton.click();

   const defaultDaysButton = page.getByRole("button", { name: "Default", exact: true });
   await defaultDaysButton.hover();
   const preferencesTooltip = page.locator('.settings-dialog .control-tooltip[data-open="true"]');
   await expect(preferencesTooltip).toContainText("Show Monday through Friday");
   await expect(preferencesTooltip).toBeVisible();

   await page.locator(".settings-dialog__header").getByRole("button", { name: "Close settings" }).click();
   await expect(page.getByRole("dialog", { name: "Preferences" })).toBeHidden();
   await page.waitForTimeout(600);
   await expect(page.locator('.control-tooltip[data-open="true"]')).toHaveCount(0);
});

test("the mobile shell uses a solid theme canvas and stable popup text sizing", async ({ page }) => {
   await page.setViewportSize({ width: 390, height: 844 });
   await page.goto("/");

   const mobilePlatformStyles = await page.evaluate(() => ({
      canvas: getComputedStyle(document.documentElement).backgroundColor,
      pageBackground: getComputedStyle(document.body, "::before").backgroundImage,
      viewport: document.querySelector<HTMLMetaElement>('meta[name="viewport"]')?.content,
      themeColor: document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.content,
   }));
   expect(mobilePlatformStyles.canvas).toBe("rgb(14, 17, 31)");
   expect(mobilePlatformStyles.pageBackground).toContain("gradient");
   expect(mobilePlatformStyles.viewport).toContain("minimum-scale=1");
   expect(mobilePlatformStyles.viewport).not.toContain("user-scalable=no");
   expect(mobilePlatformStyles.viewport).toContain("viewport-fit=cover");
   expect(mobilePlatformStyles.themeColor).toBe("#0e111f");

   await page.getByRole("button", { name: "Open settings" }).click();
   const description = page.locator(".settings-section__header p").first();
   const initialFontSize = await description.evaluate((element) => getComputedStyle(element).fontSize);
   await page.getByRole("radio", { name: "Light", exact: true }).click();
   await page.getByRole("button", { name: "Light", exact: true }).click();
   await expect.poll(() => page.locator('meta[name="theme-color"]').getAttribute("content")).toBe("#f9fbfe");
   await page.setViewportSize({ width: 844, height: 390 });
   await page.setViewportSize({ width: 390, height: 844 });
   await expect.poll(() => description.evaluate((element) => getComputedStyle(element).fontSize)).toBe(initialFontSize);

   await page.locator(".settings-dialog__header").getByRole("button", { name: "Close settings" }).click();
   await page.getByRole("button", { name: /SOURCE_TITLE_0_1/ }).click();
   const classFieldValue = page.locator(".class-panel__details dd").first();
   const initialFieldFontSize = await classFieldValue.evaluate((element) => getComputedStyle(element).fontSize);
   await page.setViewportSize({ width: 844, height: 390 });
   await page.setViewportSize({ width: 390, height: 844 });
   await expect.poll(() => classFieldValue.evaluate((element) => getComputedStyle(element).fontSize)).toBe(initialFieldFontSize);
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
