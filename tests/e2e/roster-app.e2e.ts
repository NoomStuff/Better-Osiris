import { isoWeekNumber } from "../../shared/calendar";
import { THEMES_BY_MODE } from "../../src/lib/theme";
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
   page.on("console", (message) => {
      if (message.type() === "error" && /Cannot update a component|Maximum update depth|Each child in a list should/.test(message.text()))
         errors.push(message.text());
   });
   await page.emulateMedia({ colorScheme: "dark" });
   await installFixedClock(page);
   await mockAppApis(page);
});

test.afterEach(({ page }) => {
   expect(pageErrors.get(page) ?? []).toEqual([]);
});

test("week navigation and reset show the matching roster data", async ({ page }) => {
   await installCachedLastWeek(page);
   await page.goto("/");

   await expect(page.getByRole("heading", { name: /Week 25:/ })).toBeVisible();
   await expect(page.locator(".app-toolbar__identity .eyebrow")).toHaveCount(0);
   await expect(page.getByRole("button", { name: "Previous week" })).toBeEnabled();
   await expect(page.getByRole("button", { name: "Next week" })).toBeEnabled();
   await expect(page.locator(".grid-class", { hasText: "SOURCE_TITLE_0_1" })).toBeVisible();
   await expect(page.getByRole("button", { name: "Grid view" })).toHaveAttribute("aria-pressed", "true");

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
});

test("shared easing keeps toolbar entrance and agenda folding animated", async ({ page }) => {
   await page.goto("/");
   await expect(page.locator(".action-group")).not.toHaveCSS("animation-name", "none");
   await page.getByRole("button", { name: "Agenda view" }).click();
   await page.getByRole("button", { name: "Collapse", exact: true }).click();
   await expect(page.locator(".day-group__body").first()).not.toHaveCSS("transition-duration", "0s");
});

test("selected view buttons keep the chrome palette at rest and on hover", async ({ page }) => {
   await page.goto("/");
   await expect(page.locator(".grid-shell")).toBeVisible();
   await page.evaluate(() => document.documentElement.setAttribute("data-theme", "espresso"));
   const background = await page.evaluate(() => {
      const probe = document.createElement("span");
      probe.style.backgroundColor = "rgba(var(--chrome-accent-rgb), 0.12)";
      document.body.append(probe);
      const color = getComputedStyle(probe).backgroundColor;
      probe.remove();
      return color;
   });
   const button = page.getByRole("button", { name: "Grid view", exact: true });
   await expect(button.locator(".icon-button__surface")).toHaveCSS("background-color", background);
   await button.hover();
   await expect(button.locator(".icon-button__surface")).toHaveCSS("background-color", background);
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
   await expect(page.locator(".grid-class").first()).toBeVisible();

   await page.keyboard.down("ArrowRight");
   await expect(page.locator(".weekbar__label")).toHaveText("Next week");
   await expect
      .poll(() => page.evaluate(() => document.getAnimations().map((animation) => (animation instanceof CSSAnimation ? animation.animationName : ""))))
      .toEqual(expect.arrayContaining(["view-enter-from-right"]));
   // The label moves on every repeat, so assert the distance travelled instead of a transient value.
   await expect
      .poll(async () => {
         const weeks = /In (\d+) weeks?/.exec((await page.locator(".weekbar__label").textContent()) ?? "");
         return weeks ? Number(weeks[1]) : 0;
      })
      .toBeGreaterThanOrEqual(3);
   await page.keyboard.up("ArrowRight");
   // The last repeat's enter animation outlives keyup, so wait for the week's own keyframes to
   // finish before reading where the hold stopped. Other page animations linger forever, so only
   // the transition's own animation counts as in-flight.
   await expect
      .poll(() =>
         page.evaluate(
            () =>
               document.getAnimations().filter((animation) => {
                  const name = animation instanceof CSSAnimation ? animation.animationName : "";
                  return name.startsWith("view-enter");
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
      .toEqual(expect.arrayContaining(["view-enter-from-right"]));

   const previousWeek = page.getByRole("button", { name: "Previous week", exact: true });
   for (const label of ["In 2 weeks", "Next week", "This week"]) {
      await previousWeek.click();
      await expect(page.locator(".weekbar__label")).toHaveText(label);
   }
});

test("week swipe plays the same content transition", async ({ page }) => {
   await page.goto("/");
   await expect(page.locator(".grid-class").first()).toBeVisible();

   await swipeWeek(page, "next");
   await expect(page.locator(".weekbar__label")).toHaveText("Next week");
   await expect
      .poll(() => page.evaluate(() => document.getAnimations().map((animation) => (animation instanceof CSSAnimation ? animation.animationName : ""))))
      .toEqual(expect.arrayContaining(["view-enter-from-right"]));

   await swipeWeek(page, "previous");
   await expect(page.locator(".weekbar__label")).toHaveText("This week");
   await expect
      .poll(() => page.evaluate(() => document.getAnimations().map((animation) => (animation instanceof CSSAnimation ? animation.animationName : ""))))
      .toEqual(expect.arrayContaining(["view-enter-from-left"]));
});

test("shift and an arrow moves by one roster batch", async ({ page }) => {
   await page.goto("/");
   await expect(page.locator(".grid-class").first()).toBeVisible();

   await page.keyboard.press("Shift+ArrowRight");
   await expect(page.locator(".weekbar__label")).toHaveText("In 5 weeks");

   await page.keyboard.press("Shift+ArrowLeft");
   await expect(page.locator(".weekbar__label")).toHaveText("This week");
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

test("mobile grid fits its viewport and week buttons remain repeatable", async ({ page }) => {
   await page.setViewportSize({ width: 390, height: 844 });
   await page.addInitScript(() => {
      window.localStorage.setItem("roster-view-mode", "grid");
   });
   await page.goto("/");

   await expect(page.locator(".grid-shell")).toBeVisible();
   await expect(page.locator(".overlay-scrollbar")).toHaveCount(0);
   await expect(page.getByRole("button", { name: "Grid view" })).toHaveAttribute("aria-pressed", "true");

   const pageBackgrounds = await page.evaluate(() => ({
      root: getComputedStyle(document.documentElement).backgroundImage,
      backdrop: getComputedStyle(document.body, "::before").backgroundImage,
   }));
   expect(pageBackgrounds.root).not.toBe("none");
   expect(pageBackgrounds.root).toBe(pageBackgrounds.backdrop);

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
      .toEqual(expect.arrayContaining(["view-enter-from-right"]));
});

test("one-hour grid shrinks below its row minimum on compact mobile viewports", async ({ page }) => {
   await page.setViewportSize({ width: 375, height: 600 });
   await page.addInitScript(() => {
      window.localStorage.setItem("roster-view-mode", "grid");
   });
   await page.goto("/");

   await expect(page.locator(".grid-shell")).toBeVisible();
   const readMetrics = () =>
      page.evaluate(() => {
         const app = document.getElementById("app");
         const frame = document.querySelector<HTMLElement>(".app-content-frame--grid");
         return {
            viewportHeight: window.visualViewport?.height ?? window.innerHeight,
            pageHeight: document.documentElement.scrollHeight,
            appMinHeight: app ? getComputedStyle(app).minHeight : null,
            frameHeight: frame?.getBoundingClientRect().height ?? 0,
            rowMinimum: Number.parseFloat(frame ? getComputedStyle(frame).getPropertyValue("--grid-min-height") : "0"),
         };
      });

   const metrics = await readMetrics();
   expect(metrics.appMinHeight).toBe("0px");
   expect(metrics.frameHeight).toBeLessThan(metrics.rowMinimum);
   expect(metrics.pageHeight).toBeLessThanOrEqual(Math.ceil(metrics.viewportHeight));

   await page.evaluate(() => document.documentElement.style.setProperty("--stable-vh", "700px"));
   const staleViewportMetrics = await readMetrics();
   expect(staleViewportMetrics.frameHeight).toBe(metrics.frameHeight);
   expect(staleViewportMetrics.pageHeight).toBeLessThanOrEqual(Math.ceil(staleViewportMetrics.viewportHeight));
});

test("short mobile agendas do not inherit a stale viewport minimum", async ({ page }) => {
   await page.setViewportSize({ width: 390, height: 844 });
   await page.route("**/api/roster/weeks?*", async (route) => {
      const url = new URL(route.request().url());
      const offset = Number(url.searchParams.get("offset") ?? "0");
      const limit = Number(url.searchParams.get("limit") ?? "5");
      const batch = createRosterBatch(offset, limit);

      await route.fulfill({
         status: 200,
         contentType: "application/json",
         body: JSON.stringify({ ...batch, weeks: batch.weeks.map((week) => ({ ...week, classes: [] })) }),
      });
   });
   await page.goto("/");

   await expect(page.locator(".roster-overlay-state")).toBeVisible();
   await page.evaluate(() => document.documentElement.style.setProperty("--stable-vh", "1000px"));
   const metrics = await page.evaluate(() => {
      const app = document.getElementById("app");
      return {
         viewportHeight: window.visualViewport?.height ?? window.innerHeight,
         pageHeight: document.documentElement.scrollHeight,
         appMinHeight: app ? getComputedStyle(app).minHeight : null,
         bodyMinHeight: getComputedStyle(document.body).minHeight,
      };
   });

   expect(metrics.appMinHeight).toBe("0px");
   expect(metrics.bodyMinHeight).toBe("0px");
   expect(metrics.pageHeight).toBeLessThanOrEqual(Math.ceil(metrics.viewportHeight));
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
   await expect(page.getByRole("button", { name: "Save" })).toBeDisabled();

   await page.getByRole("group", { name: "Shown weekdays" }).getByRole("button", { name: "Sun", exact: true }).click();
   await expect(page.getByRole("group", { name: "Shown weekdays" }).getByRole("button", { name: "Sun", exact: true })).toHaveAttribute("aria-pressed", "true");

   const rosterAccess = page.getByRole("region", { name: "Roster access" });
   await rosterAccess.getByRole("button", { name: "Remove" }).click();
   await expect(page.getByRole("alertdialog", { name: "Remove bearer token?" })).toBeVisible();
   await page.getByRole("button", { name: "Remove token" }).click();
   await expect(page.getByRole("alertdialog", { name: "Remove bearer token?" })).toBeHidden();
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

test("grid hour dragging keeps the captured thumb and the minimum gap", async ({ page }) => {
   await page.goto("/");
   await page.getByRole("button", { name: "Open settings" }).click();
   const hours = page.getByRole("region", { name: "Grid hours" });
   const control = hours.locator(".slider__control");
   await control.scrollIntoViewIfNeeded();
   const bounds = await control.boundingBox();
   if (!bounds) throw new Error("Grid hour slider is not laid out");
   const y = bounds.y + bounds.height / 2;
   await page.mouse.move(bounds.x + (10 / 24) * bounds.width, y);
   await page.mouse.down();
   await expect(hours.getByRole("slider", { name: "Grid start time" })).toHaveValue("10");
   await page.mouse.move(bounds.x + (20 / 24) * bounds.width, y, { steps: 5 });
   await page.mouse.up();
   await expect(hours.getByRole("slider", { name: "Grid start time" })).toHaveValue("17");
   await expect(hours.getByRole("slider", { name: "Grid end time" })).toHaveValue("18");
   await page.keyboard.press("ArrowLeft");
   await expect(hours.getByRole("slider", { name: "Grid start time" })).toHaveValue("16");
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

   const resetTokenButton = settings.getByRole("region", { name: "Roster access" }).getByRole("button", { name: "Remove" });
   await resetTokenButton.click();
   const confirmation = page.getByRole("alertdialog", { name: "Remove bearer token?" });
   await expect(confirmation).toBeVisible();
   await page.keyboard.press("Escape");

   await expect(confirmation).toBeHidden();
   await expect(settings).toBeVisible();
   await expect(resetTokenButton).toBeFocused();
});

test("a confirming dialog stays topmost while its parent updates", async ({ page }) => {
   let releaseReset = () => undefined;
   const resetGate = new Promise<void>((resolve) => {
      releaseReset = resolve;
   });
   await page.route("**/api/settings/osiris-token", async (route) => {
      if (route.request().method() === "DELETE") {
         await resetGate;
      }
      await route.fallback();
   });

   await page.goto("/");
   await page.getByRole("button", { name: "Open settings" }).click();
   const settings = page.getByRole("dialog", { name: "Preferences" });
   await settings.getByRole("region", { name: "Roster access" }).getByRole("button", { name: "Remove" }).click();

   const confirmation = page.getByRole("alertdialog", { name: "Remove bearer token?" });
   await confirmation.getByRole("button", { name: "Remove token" }).click();

   await expect(page.locator(".confirm-dialog")).not.toHaveAttribute("inert", "");
   await expect(page.locator(".settings-dialog")).toHaveAttribute("inert", "");
   await expect(confirmation.getByRole("button", { name: "Working..." })).toBeDisabled();

   releaseReset();
   await expect(confirmation).toBeHidden();
   await expect(page.locator(".settings-dialog")).not.toHaveAttribute("inert", "");
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
   let holdReplacementRequest = false;
   let releaseReplacementRequest = () => undefined;
   const replacementRequestGate = new Promise<void>((resolve) => {
      releaseReplacementRequest = resolve;
   });
   page.on("request", (request) => {
      if (request.url().includes("/api/roster/weeks?")) {
         rosterRequestCount += 1;
      }
   });
   await page.route("**/api/roster/weeks?*", async (route) => {
      if (holdReplacementRequest) {
         await replacementRequestGate;
      }
      await route.fallback();
   });

   await page.goto("/");
   await expect(page.getByRole("button", { name: "SOURCE_TITLE_0_1" })).toBeVisible();
   const initialRequestCount = rosterRequestCount;

   await page.getByRole("button", { name: "Open settings" }).click();
   const settings = page.getByRole("dialog", { name: "Preferences" });
   const tokenInput = settings.getByLabel("Bearer token");
   const saveButton = settings.getByRole("button", { name: "Save" });
   await tokenInput.fill("Bearer replacement-token");
   await expect(tokenInput).toHaveValue("Bearer replacement-token");
   await expect(saveButton).toBeEnabled();
   holdReplacementRequest = true;
   const weekRefresh = page.waitForResponse((response) => response.url().includes("/api/roster/weeks?") && response.request().method() === "GET");
   await saveButton.click();

   await expect(settings.getByRole("button", { name: "Verifying..." })).toBeDisabled();
   await expect(tokenInput).toHaveValue("Bearer replacement-token");
   releaseReplacementRequest();
   await weekRefresh;

   await expect.poll(() => rosterRequestCount).toBeGreaterThan(initialRequestCount);
   await expect(settings).toBeVisible();
   await expect(tokenInput).toHaveValue("");
   await expect(page.locator(".grid-class", { hasText: "SOURCE_TITLE_0_1" })).toBeVisible();
});

test("settings keeps a rejected token editable", async ({ page }) => {
   let rejectRosterRequest = false;
   await page.route("**/api/settings/osiris-token", async (route) => {
      if (route.request().method() !== "PUT" || !rejectRosterRequest) {
         await route.fallback();
         return;
      }

      await route.fulfill({
         status: 401,
         contentType: "application/json",
         body: JSON.stringify({ code: "AUTH_REQUIRED", error: "OSIRIS rejected the token.", retryable: false }),
      });
   });

   await page.goto("/");
   await expect(page.getByRole("button", { name: "SOURCE_TITLE_0_1" })).toBeVisible();
   await page.getByRole("button", { name: "Open settings" }).click();

   const settings = page.getByRole("dialog", { name: "Preferences" });
   const tokenInput = settings.getByLabel("Bearer token");
   await tokenInput.fill("Bearer rejected-replacement");
   rejectRosterRequest = true;
   await settings.getByRole("button", { name: "Save" }).click();

   await expect(settings.getByText("OSIRIS rejected this token. Paste a fresh one and try again.")).toBeVisible();
   await expect(tokenInput).toHaveValue("Bearer rejected-replacement");
   await expect(settings.getByRole("button", { name: "Save" })).toBeEnabled();
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
         body: JSON.stringify({ hasCustomToken: tokenVersion > 0, hasBearerToken: tokenVersion > 0, contextId: tokenVersion > 0 ? "test-context" : null }),
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

test("class details use location and date as context for the primary facts", async ({ page }) => {
   await page.goto("/");
   await page.getByRole("button", { name: /SOURCE_TITLE_0_1/ }).click();

   const dialog = page.getByRole("dialog", { name: "Class details" });
   const glance = dialog.getByRole("region", { name: "Where and when" });
   await expect(glance).toContainText("SOURCE_ROOM");
   await expect(glance).toContainText("SOURCE_LOCATION");
   await expect(glance).toContainText("Tuesday 16 June");
   await expect(glance).toContainText("09:00 – 10:30");
   const teacher = dialog.getByRole("region", { name: "Teacher" });
   await expect(teacher).toContainText("is teaching");
   await expect(teacher).toContainText("SOURCE_TEACHER");
   await expect(glance.getByRole("region", { name: "Details" })).toContainText("SOURCE_DESCRIPTION");
   await expect(dialog.getByRole("heading", { name: "Details" })).toHaveCount(0);
});

test("changed class details keep old and current room and time values together", async ({ page }) => {
   await page.addInitScript(() => {
      window.localStorage.setItem("roster-devtools-enabled", "true");
      window.localStorage.setItem("roster-devtools-status-preview", "changed");
   });
   await page.goto("/");
   await page.getByRole("button", { name: /SOURCE_TITLE_0_1/ }).click();

   const dialog = page.getByRole("dialog", { name: "Class details" });
   const status = dialog.locator(".class-panel__status--changed");
   await expect(status).toContainText("changed");
   await expect(status.locator(".fa-pen")).toBeVisible();
   const place = dialog.locator(".class-panel__place");
   await expect(place.locator("s")).toHaveText("A101");
   await expect(place.locator("strong")).toHaveText("SOURCE_ROOM");
   const time = dialog.locator(".class-panel__time-value");
   await expect(time.locator("s")).toHaveText("08:30 – 10:00");
   await expect(time.locator("strong")).toHaveText("09:00 – 10:30");
});

test("a removed location is not presented as changing into the Room fallback label", async ({ page }) => {
   await page.route("**/api/roster/weeks?*", async (route) => {
      const url = new URL(route.request().url());
      const offset = Number(url.searchParams.get("offset") ?? "0");
      const limit = Number(url.searchParams.get("limit") ?? "5");
      const batch = createRosterBatch(offset, limit);

      await route.fulfill({
         status: 200,
         contentType: "application/json",
         body: JSON.stringify({
            ...batch,
            weeks: batch.weeks.map((week) => ({
               ...week,
               classes: week.classes.map((schoolClass, index) =>
                  index === 0
                     ? {
                          ...schoolClass,
                          location: "",
                          status: "changed",
                          previous: { ...schoolClass, location: "LMSA923", status: "scheduled" },
                       }
                     : schoolClass
               ),
            })),
         }),
      });
   });
   await page.goto("/");
   await page.getByRole("button", { name: /SOURCE_TITLE_0_1/ }).click();

   const context = page.getByRole("dialog", { name: "Class details" }).locator(".class-panel__place .class-panel__glance-context");
   await expect(context.locator("s")).toHaveText("LMSA923");
   await expect(context.locator("strong")).toHaveText("Not set");
   await expect(context).not.toContainText("Room");
});

test("cancelled class details strike through place, date and time", async ({ page }) => {
   await page.addInitScript(() => {
      window.localStorage.setItem("roster-devtools-enabled", "true");
      window.localStorage.setItem("roster-devtools-status-preview", "cancelled");
   });
   await page.goto("/");
   await page.getByRole("button", { name: /SOURCE_TITLE_0_1/ }).click();

   const dialog = page.getByRole("dialog", { name: "Class details" });
   const status = dialog.locator(".class-panel__status--cancelled");
   await expect(status).toContainText("cancelled");
   await expect(status.locator(".fa-trash-can")).toBeVisible();
   const cancelledPlaceValues = dialog.locator(".class-panel__place .class-panel__cancelled-value");
   await expect(cancelledPlaceValues).toHaveCount(2);
   await expect(cancelledPlaceValues.nth(0)).toHaveText("SOURCE_LOCATION");
   await expect(cancelledPlaceValues.nth(1)).toHaveText("SOURCE_ROOM");
   const cancelledValues = dialog.locator(".class-panel__time .class-panel__cancelled-value");
   await expect(cancelledValues).toHaveCount(2);
   await expect(cancelledValues.nth(0)).toHaveText("Tuesday 16 June");
   await expect(cancelledValues.nth(1)).toHaveText("09:00 – 10:30");
});

test("added class details show the pin status marker and plus markers for place and time", async ({ page }) => {
   await page.addInitScript(() => {
      window.localStorage.setItem("roster-devtools-enabled", "true");
      window.localStorage.setItem("roster-devtools-status-preview", "added");
   });
   await page.goto("/");
   await page.getByRole("button", { name: /SOURCE_TITLE_0_1/ }).click();

   const dialog = page.getByRole("dialog", { name: "Class details" });
   const status = dialog.locator(".class-panel__status--added");
   await expect(status).toContainText("added");
   await expect(status.locator(".fa-thumbtack")).toBeVisible();
   await expect(dialog.locator(".class-panel__place .class-panel__added-value > .fa-plus")).toBeVisible();
   await expect(dialog.locator(".class-panel__time .class-panel__added-value > .fa-plus")).toBeVisible();
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
         body: JSON.stringify({ hasCustomToken: false, hasBearerToken: false, contextId: null }),
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
   const saveTokenButton = page.getByRole("button", { name: "Load roster" });
   await expect(tokenInput).toBeVisible();
   await expect(saveTokenButton).toBeDisabled();
   await tokenInput.fill("Bearer browser-token");
   await expect(saveTokenButton).toBeEnabled();
   expect(rosterWasRequested).toBe(false);
});

test("keeps token entry open until OSIRIS accepts the token", async ({ page }) => {
   let releaseRoster = () => undefined;
   const rosterGate = new Promise<void>((resolve) => {
      releaseRoster = resolve;
   });
   let hasToken = false;
   let rejectToken = true;

   await page.route("**/api/settings/osiris-token", async (route) => {
      if (route.request().method() === "PUT") {
         if (rejectToken) {
            await route.fulfill({
               status: 401,
               contentType: "application/json",
               body: JSON.stringify({ code: "AUTH_REQUIRED", error: "OSIRIS rejected the token.", retryable: false }),
            });
            return;
         }
         hasToken = true;
      }
      await route.fulfill({
         status: 200,
         contentType: "application/json",
         body: JSON.stringify({ hasCustomToken: hasToken, hasBearerToken: hasToken, contextId: hasToken ? "test-context" : null }),
      });
   });
   await page.route("**/api/roster/weeks?*", async (route) => {
      await rosterGate;
      const url = new URL(route.request().url());
      const offset = Number(url.searchParams.get("offset") ?? "0");
      const limit = Number(url.searchParams.get("limit") ?? "5");
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(createRosterBatch(offset, limit)) });
   });

   await page.goto("/");
   const tokenInput = page.getByLabel("Bearer token");
   await tokenInput.fill("Bearer rejected-token");
   await page.getByRole("button", { name: "Load roster" }).click();

   await expect(page.getByRole("heading", { name: "Bearer token rejected" })).toBeVisible();
   await expect(tokenInput).toHaveValue("Bearer rejected-token");

   rejectToken = false;
   await tokenInput.fill("Bearer accepted-token");
   await page.getByRole("button", { name: "Load roster" }).click();

   await expect(page.getByRole("heading", { name: "Checking bearer token" })).toBeVisible();
   releaseRoster();
   await expect(page.getByRole("button", { name: "SOURCE_TITLE_0_1" })).toBeVisible();
   await expect(page.getByRole("heading", { name: /Bearer token/ })).toHaveCount(0);
});

test("retries token settings instead of showing the entry form after a transient startup failure", async ({ page }) => {
   let settingsRequestCount = 0;
   await page.route("**/api/settings/osiris-token", async (route) => {
      settingsRequestCount += 1;
      if (settingsRequestCount === 1) {
         await route.fulfill({ status: 502, contentType: "text/plain", body: "Dev server is starting." });
         return;
      }

      await route.fulfill({
         status: 200,
         contentType: "application/json",
         body: JSON.stringify({ hasCustomToken: false, hasBearerToken: true, contextId: "test-context" }),
      });
   });

   await page.goto("/");

   await expect(page.getByRole("heading", { name: "Bearer token required" })).toHaveCount(0);
   await expect(page.getByRole("button", { name: "SOURCE_TITLE_0_1" })).toBeVisible();
   expect(settingsRequestCount).toBeGreaterThan(1);
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

test("the theme picker follows the device category without changing a saved theme", async ({ page }) => {
   await page.addInitScript(() => localStorage.setItem("roster-theme", "light"));
   await page.goto("/");
   await page.getByRole("button", { name: "Open settings" }).click();
   await page.getByRole("radio", { name: "Light", exact: true }).click();
   await expect(page.getByRole("button", { name: "Light", exact: true })).toBeVisible();

   await page.locator(".settings-dialog__header").getByRole("button", { name: "Close settings" }).click();
   await page.getByRole("button", { name: "Open settings" }).click();

   await expect(page.getByRole("radio", { name: "Dark", exact: true })).toHaveAttribute("aria-checked", "true");
   await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
   await page.locator(".settings-dialog__header").getByRole("button", { name: "Close settings" }).click();
   await expect(page.getByRole("dialog", { name: "Preferences" })).toBeHidden();
   await page.emulateMedia({ colorScheme: "light" });
   await page.getByRole("button", { name: "Open settings" }).click();
   await expect(page.getByRole("radio", { name: "Light", exact: true })).toHaveAttribute("aria-checked", "true");
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

test("every theme keeps settings text readable", async ({ page, browserName }) => {
   test.skip(browserName !== "chromium", "One browser is enough for deterministic computed-color checks.");
   test.slow();
   await page.emulateMedia({ reducedMotion: "reduce" });

   await page.goto("/");
   await page.getByRole("button", { name: "Open settings" }).click();

   for (const [mode, themes] of [
      ["Dark", THEMES_BY_MODE.dark],
      ["Light", THEMES_BY_MODE.light],
   ] as const) {
      await page.getByRole("radio", { name: mode, exact: true }).click();

      for (const theme of themes) {
         await page.getByRole("button", { name: theme.label, exact: true }).click();
         const results = await new AxeBuilder({ page }).include(".settings-dialog").withRules(["color-contrast"]).analyze();
         expect(results.violations, `${theme.label} should pass text contrast checks`).toEqual([]);
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

         static now() {
            return fixedNow();
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
         body: JSON.stringify({ hasCustomToken, hasBearerToken: hasCustomToken, contextId: hasCustomToken ? "test-context" : null }),
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
      contextId: "test-context",
      fetchedAt: Date.now(),
      hasMore: offset + limit < 50,
      timeZone: "Europe/Amsterdam",
      weeks: Array.from({ length: limit }, (_, index) => createWeek(offset + index)),
   };
}

function createShiftedRosterBatch(offset: number, limit: number, shift: number) {
   const batch = createRosterBatch(offset + shift, limit);
   batch.offset = offset;
   batch.weeks.forEach((week) => {
      week.week.offset -= shift;
   });
   return batch;
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

test("switching credentials in another tab discards account data and diff history", async ({ page, context }) => {
   await page.unroute("**/api/settings/osiris-token");
   await page.unroute("**/api/roster/weeks?*");
   let account = "A";
   await context.route("**/api/settings/osiris-token", async (route) => {
      if (route.request().method() === "PUT") account = (route.request().postDataJSON() as { token: string }).token.endsWith("-b") ? "B" : "A";
      await route.fulfill({ json: { hasCustomToken: true, hasBearerToken: true, contextId: account } });
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

test("a failed first token save retains the draft and does not promise an automatic save retry", async ({ page }) => {
   let saves = 0;
   await page.route("**/api/settings/osiris-token", (route) => {
      if (route.request().method() === "PUT") {
         saves += 1;
         return route.fulfill({ status: 503, json: { error: "Unavailable", retryable: true } });
      }
      return route.fulfill({ json: { hasBearerToken: false, hasCustomToken: false, contextId: null } });
   });
   await page.goto("/");
   await page.getByLabel("Bearer token", { exact: true }).fill("Bearer same-token");
   await page.getByRole("button", { name: "Load roster" }).click();
   await expect(page.getByText("Could not save bearer token", { exact: true })).toBeVisible();
   await expect(page.getByLabel("Bearer token", { exact: true })).toHaveValue("Bearer same-token");
   await expect(page.getByText(/will retry automatically/)).toHaveCount(0);
   await page.getByRole("button", { name: "Load roster" }).click();
   await expect.poll(() => saves).toBe(2);
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

test("overlapping and cancelled agenda classes do not invent a break or hide status", async ({ page }) => {
   await page.setViewportSize({ width: 390, height: 844 });
   await page.route("**/api/roster/weeks?*", (route) => {
      const url = new URL(route.request().url());
      const batch = createRosterBatch(Number(url.searchParams.get("offset")), Number(url.searchParams.get("limit")));
      const week = batch.weeks[0];
      const first = week?.classes[0];
      if (week && first)
         week.classes = [
            { ...first, end: first.end.replace("10:30", "12:00") },
            {
               ...first,
               id: first.id + "short",
               title: "Short overlap",
               start: first.start.replace("09:00", "09:30"),
               end: first.end.replace("10:30", "10:00"),
            },
            {
               ...first,
               id: first.id + "third",
               title: "Third overlap",
               start: first.start.replace("09:00", "11:00"),
               end: first.end.replace("10:30", "11:30"),
            },
            { ...first, id: first.id + "cancelled", title: "Cancelled example", status: "cancelled" },
         ];
      return route.fulfill({ json: batch });
   });
   await page.goto("/");
   await expect(page.getByRole("button", { name: /Cancelled.*Cancelled example/ })).toBeVisible();
   await expect(page.locator(".agenda-breaktime")).toHaveCount(0);
   await expect(page.locator('.day-group[data-day="2026-06-16"] .day-group__meta')).toContainText("3 classes");
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
   await page.addInitScript(() => localStorage.setItem("test-clock", localStorage.getItem("test-clock") ?? "2026-06-21T23:55:00+02:00"));
   await page.goto("/");
   await expect(page.getByRole("button", { name: "SOURCE_TITLE_0_1" })).toBeVisible();
   removed = true;
   await page.evaluate(() => window.dispatchEvent(new Event("online")));
   await expect(page.locator(".grid-class.status-cancelled")).toHaveCount(2);
   monday = true;
   await page.evaluate(() => localStorage.setItem("test-clock", "2026-06-22T00:05:00+02:00"));
   await page.reload();
   await expect(page.getByRole("heading", { name: /Week 27:/ })).toBeVisible();
   await page.getByRole("button", { name: "Previous week" }).click();
   await expect(page.getByRole("heading", { name: /Week 26:/ })).toBeVisible();
   await expect(page.locator(".grid-class")).toHaveCount(0);
   await page.getByRole("button", { name: "Previous week" }).click();
   await expect(page.locator(".grid-class.status-cancelled")).toHaveCount(2);
});

test("notification delivery falls back to a worker and deduplicates a change across tabs", async ({ page, context }) => {
   const deliveries: string[] = [];
   await context.exposeBinding("recordDelivery", (_source, body: string) => {
      deliveries.push(body);
   });
   await context.addInitScript(() => {
      function MobileNotification() {
         throw new TypeError("Use a service worker");
      }
      Object.defineProperty(MobileNotification, "permission", { value: "granted" });
      Object.defineProperty(window, "Notification", { value: MobileNotification });
      Object.defineProperty(navigator, "serviceWorker", {
         value: {
            register: () => Promise.resolve({}),
            ready: Promise.resolve({
               showNotification: (_title: string, options: { body: string }) =>
                  (window as unknown as { recordDelivery: (body: string) => Promise<void> }).recordDelivery(options.body),
            }),
         },
      });
      localStorage.setItem("roster-class-notifications", "true");
   });
   let changed = false;
   const second = await context.newPage();
   await installFixedClock(second);
   await mockAppApis(second);
   for (const tab of [page, second]) {
      await tab.route("**/api/roster/weeks?*", (route) => {
         const url = new URL(route.request().url());
         const batch = createRosterBatch(Number(url.searchParams.get("offset")), Number(url.searchParams.get("limit")));
         const first = batch.weeks[0]?.classes[0];
         if (changed && first) first.room = "NEW_ROOM";
         return route.fulfill({ json: batch });
      });
      await tab.goto("/");
      await expect(tab.locator(".grid-class").first()).toBeVisible();
   }
   changed = true;
   await Promise.all([page, second].map((tab) => tab.evaluate(() => window.dispatchEvent(new Event("online")))));
   for (const tab of [page, second]) await expect(tab.locator(".grid-class.status-changed")).toHaveCount(1);
   await expect.poll(() => deliveries).toEqual(["SOURCE_TITLE_0_1 changed: SOURCE_ROOM → NEW_ROOM"]);
   await second.close();
});

test("status rows expose readable text in both views across themes", async ({ page, browserName }) => {
   test.skip(browserName !== "chromium", "Computed contrast is deterministic in one browser.");
   test.setTimeout(90_000);
   await page.route("**/api/roster/weeks?*", (route) => {
      const url = new URL(route.request().url());
      const batch = createRosterBatch(Number(url.searchParams.get("offset")), Number(url.searchParams.get("limit")));
      batch.weeks.forEach((week) => {
         const first = week.classes[0];
         if (first) first.status = "cancelled";
         const second = week.classes[1];
         if (second) Object.assign(second, { status: "changed", previous: { ...second, status: "scheduled", room: "OLD_ROOM" } });
      });
      return route.fulfill({ json: batch });
   });
   await page.goto("/");
   await expect(page.locator(".grid-class.status-cancelled")).toBeVisible();
   const themes = [...THEMES_BY_MODE.dark, ...THEMES_BY_MODE.light];
   for (const view of ["Grid view", "Agenda view"]) {
      await page.getByRole("button", { name: view, exact: true }).click();
      for (const theme of themes) {
         await page.evaluate((id) => document.documentElement.setAttribute("data-theme", id), theme.id);
         const scope = view === "Grid view" ? ".grid-class" : ".agenda-class";
         const results = await new AxeBuilder({ page }).include(scope).withRules(["color-contrast"]).analyze();
         expect(results.violations, `${theme.label} ${view} class text`).toEqual([]);
      }
   }
});

test("replacing a token from the cache-only previous week returns to the current roster", async ({ page }) => {
   await installCachedLastWeek(page);
   await page.goto("/");
   await expect(page.locator(".grid-class").first()).toBeVisible();
   await page.getByRole("button", { name: "Previous week", exact: true }).click();
   await expect(page.locator(".weekbar__label")).toHaveText("Last week");
   await page.getByRole("button", { name: "Open settings" }).click();
   const settings = page.getByRole("dialog", { name: "Preferences" });
   await settings.getByLabel("Bearer token").fill("Bearer replacement-from-last-week");
   await settings.getByRole("button", { name: "Save", exact: true }).click();
   await expect(settings.getByLabel("Bearer token")).toHaveValue("");
   await settings.getByRole("button", { name: "Close settings", exact: true }).click();
   await expect(page.locator(".weekbar__label")).toHaveText("This week");
   await expect(page.locator(".grid-class").first()).toContainText("SOURCE_TITLE_0_1");
});

test("startup and reset choose the upcoming roster and exclude uncached omitted weeks", async ({ page }) => {
   await page.route("**/api/roster/weeks?*", (route) => {
      const url = new URL(route.request().url());
      return route.fulfill({ json: createShiftedRosterBatch(Number(url.searchParams.get("offset")), Number(url.searchParams.get("limit")), 1) });
   });
   await page.goto("/");
   await expect(page.getByRole("button", { name: "SOURCE_TITLE_1_1" })).toBeVisible();
   await expect(page.locator(".weekbar__content")).toHaveAttribute("data-week-position", "current");
   await expect(page.locator(".weekbar__label")).toHaveText("Next week");
   await expect(page.getByRole("button", { name: "Previous week" })).toBeDisabled();
   await page.keyboard.press("ArrowLeft");
   await swipeWeek(page, "previous");
   await expect(page.locator(".weekbar__label")).toHaveText("Next week");
   for (const key of ["Space", "r", "0"]) {
      await page.keyboard.press("5");
      await expect(page.getByRole("button", { name: "SOURCE_TITLE_5_1" })).toBeVisible();
      await expect(page.locator(".weekbar__content")).toHaveAttribute("data-week-position", "future");
      await page.keyboard.press(key);
      await expect(page.getByRole("button", { name: "SOURCE_TITLE_1_1" })).toBeVisible();
   }
   await page.getByRole("button", { name: "Next week", exact: true }).click();
   await page.locator(".weekbar__content").click();
   await expect(page.getByRole("button", { name: "SOURCE_TITLE_1_1" })).toBeVisible();
   await expect(page.getByRole("heading", { name: "Week not returned" })).toHaveCount(0);
});

test("an empty weekend opens next week while the saved current week stays browsable", async ({ page }) => {
   await page.addInitScript(() => localStorage.setItem("test-clock", "2026-06-21T12:00:00+02:00"));
   await page.goto("/");
   await expect(page.getByRole("button", { name: "SOURCE_TITLE_1_1" })).toBeVisible();
   await expect(page.locator(".weekbar__content")).toHaveAttribute("data-week-position", "current");
   await page.getByRole("button", { name: "Previous week" }).click();
   await expect(page.getByRole("button", { name: "SOURCE_TITLE_0_1" })).toBeVisible();
   await expect(page.locator(".weekbar__content")).toHaveAttribute("data-week-position", "past");
   await page.evaluate(() => (document.activeElement instanceof HTMLElement ? document.activeElement.blur() : undefined));
   await page.keyboard.press("Space");
   await expect(page.getByRole("button", { name: "SOURCE_TITLE_1_1" })).toBeVisible();
   await page.reload();
   await expect(page.getByRole("button", { name: "SOURCE_TITLE_1_1" })).toBeVisible();
   await page.getByRole("button", { name: "Previous week" }).click();
   await expect(page.getByRole("button", { name: "SOURCE_TITLE_0_1" })).toBeVisible();
});

test("a remaining weekend class keeps this week as the reset destination even when weekends are hidden", async ({ page }) => {
   await page.addInitScript(() => {
      localStorage.setItem("test-clock", "2026-06-21T08:00:00+02:00");
      localStorage.setItem("roster-shown-weekdays", "1,2,3,4,5");
   });
   await page.route("**/api/roster/weeks?*", (route) => {
      const url = new URL(route.request().url());
      const batch = createRosterBatch(Number(url.searchParams.get("offset")), Number(url.searchParams.get("limit")));
      const current = batch.weeks.find((week) => week.week.offset === 0);
      if (current) current.classes = current.classes.slice(0, 1).map((item) => ({ ...item, start: "2026-06-21T09:00:00", end: "2026-06-21T10:00:00" }));
      return route.fulfill({ json: batch });
   });
   await page.goto("/");
   await expect(page.getByRole("button", { name: "Show Sunday" })).toBeVisible();
   await expect(page.locator(".weekbar__label")).toHaveText("This week");
   await expect(page.locator(".weekbar__content")).toHaveAttribute("data-week-position", "current");
   await page.getByRole("button", { name: "Next week", exact: true }).click();
   await page.locator(".weekbar__content").click();
   await expect(page.locator(".weekbar__label")).toHaveText("This week");
   await expect(page.getByRole("button", { name: "Show Sunday" })).toBeVisible();
});

test("previous-week cache remains reachable across an omitted uncached current week", async ({ page }) => {
   await installCachedLastWeek(page);
   const offsets: number[] = [];
   await page.route("**/api/roster/weeks?*", (route) => {
      const url = new URL(route.request().url());
      const offset = Number(url.searchParams.get("offset"));
      offsets.push(offset);
      return route.fulfill({ json: createShiftedRosterBatch(offset, Number(url.searchParams.get("limit")), 1) });
   });
   await page.goto("/");
   await expect(page.getByRole("button", { name: "SOURCE_TITLE_1_1" })).toBeVisible();
   await page.getByRole("button", { name: "Previous week" }).click();
   await expect(page.getByRole("button", { name: "SOURCE_TITLE_-1_1" })).toBeVisible();
   await expect(page.locator(".weekbar__label")).toHaveText("Last week");
   await page.getByRole("button", { name: "Next week", exact: true }).click();
   await expect(page.getByRole("button", { name: "SOURCE_TITLE_1_1" })).toBeVisible();
   expect(offsets.every((offset) => offset >= 0)).toBe(true);
});

test("startup and reset keep an empty vacation week instead of jumping to distant classes", async ({ page }) => {
   await page.route("**/api/roster/weeks?*", (route) => {
      const url = new URL(route.request().url());
      const batch = createRosterBatch(Number(url.searchParams.get("offset")), Number(url.searchParams.get("limit")));
      batch.weeks.forEach((week) => {
         if (week.week.offset < 7) week.classes = [];
      });
      return route.fulfill({ json: batch });
   });
   await page.goto("/");
   await expect(page.locator(".weekbar__label")).toHaveText("This week");
   await expect(page.getByRole("heading", { name: /Week 25:/ })).toBeVisible();
   await expect(page.locator(".grid-class")).toHaveCount(0);
   await page.keyboard.press("3");
   await expect(page.locator(".weekbar__label")).toHaveText("In 3 weeks");
   await page.keyboard.press("Space");
   await expect(page.locator(".weekbar__label")).toHaveText("This week");
   await expect(page.getByRole("heading", { name: /Week 25:/ })).toBeVisible();
});

test("agenda startup opens the next week with classes", async ({ page }) => {
   await page.addInitScript(() => localStorage.setItem("roster-view-mode", "agenda"));
   await page.route("**/api/roster/weeks?*", (route) => {
      const url = new URL(route.request().url());
      return route.fulfill({ json: createShiftedRosterBatch(Number(url.searchParams.get("offset")), Number(url.searchParams.get("limit")), 1) });
   });
   await page.goto("/");
   await expect(page.getByRole("button", { name: "SOURCE_TITLE_1_1" })).toBeVisible();
   await expect(page.locator(".weekbar__label")).toHaveText("Next week");
   await expect(page.getByRole("heading", { name: "Week not returned" })).toHaveCount(0);
});

for (const target of [0, 2])
   test(`choosing week ${target} during startup prevents later automatic selection`, async ({ page }) => {
      let releaseRequest: (() => void) | undefined;
      const gate = new Promise<void>((resolve) => {
         releaseRequest = resolve;
      });
      await page.route("**/api/roster/weeks?*", async (route) => {
         const url = new URL(route.request().url());
         await gate;
         return route.fulfill({ json: createShiftedRosterBatch(Number(url.searchParams.get("offset")), Number(url.searchParams.get("limit")), 1) });
      });
      await page.goto("/");
      await expect(page.locator(".weekbar__label")).toHaveText("This week");
      if (target === 0) await page.locator(".weekbar__content").click();
      else await page.keyboard.press(String(target));
      releaseRequest?.();
      if (target === 0) {
         await expect(page.getByRole("button", { name: "SOURCE_TITLE_1_1" })).toBeVisible();
         await expect(page.locator(".weekbar__label")).toHaveText("Next week");
      } else {
         await expect(page.getByRole("button", { name: "SOURCE_TITLE_2_1" })).toBeVisible();
         await expect(page.locator(".weekbar__label")).toHaveText("In 2 weeks");
      }
   });

test("next-week source data remains instantly available from cache during a failed reload", async ({ page }) => {
   let offline = false;
   await page.route("**/api/roster/weeks?*", (route) => {
      if (offline) return route.fulfill({ status: 503, json: { error: "Temporarily unavailable" } });
      const url = new URL(route.request().url());
      return route.fulfill({ json: createShiftedRosterBatch(Number(url.searchParams.get("offset")), Number(url.searchParams.get("limit")), 1) });
   });
   await page.goto("/");
   await expect(page.getByRole("button", { name: "SOURCE_TITLE_1_1" })).toBeVisible();
   offline = true;
   await page.reload();
   await expect(page.locator(".weekbar__label")).toHaveText("Next week");
   await expect(page.getByRole("button", { name: "SOURCE_TITLE_1_1" })).toBeVisible();
   await expect(page.getByText(/Fetching your latest roster went wrong/)).toBeVisible();
});

for (const view of ["grid", "agenda"] as const)
   test(`advancing the OSIRIS source preserves visible today in ${view}`, async ({ page }) => {
      await page.addInitScript((mode) => localStorage.setItem("roster-view-mode", mode), view);
      let shift = 0;
      await page.route("**/api/roster/weeks?*", (route) => {
         const url = new URL(route.request().url());
         return route.fulfill({ json: createShiftedRosterBatch(Number(url.searchParams.get("offset")), Number(url.searchParams.get("limit")), shift) });
      });
      await page.goto("/");
      await expect(page.getByRole("button", { name: "SOURCE_TITLE_0_1" })).toBeVisible();
      shift = 1;
      await page.evaluate(() => window.dispatchEvent(new Event("online")));
      await expect
         .poll(() =>
            page.evaluate(() => {
               const cache = JSON.parse(localStorage.getItem("roster-weeks-v3") ?? "{}") as { weeks?: { data: { week: { start: string; offset: number } } }[] };
               return cache.weeks?.find((week) => week.data.week.start === "2026-06-22")?.data.week.offset;
            })
         )
         .toBe(0);
      await expect(page.locator(".weekbar__label")).toHaveText("This week");
      await expect(page.getByRole("button", { name: "SOURCE_TITLE_0_1" })).toBeVisible();
      await expect(page.getByText(/Showing your saved roster/)).toBeVisible();
      if (view === "grid") await expect(page.locator(".grid-now-line")).toBeVisible();
      else await expect(page.locator('.day-group[data-today="true"] .day-group__header')).toHaveAttribute("aria-expanded", "true");
      await expect(page.locator(".status-cancelled")).toHaveCount(0);
      await page.getByRole("button", { name: "Next week", exact: true }).click();
      await expect(page.getByRole("button", { name: "SOURCE_TITLE_1_1" })).toBeVisible();
      await page.getByRole("button", { name: "Previous week" }).click();
      await expect(page.getByRole("button", { name: "SOURCE_TITLE_0_1" })).toBeVisible();
      await page.reload();
      await expect(page.locator(".weekbar__label")).toHaveText("This week");
      await expect(page.getByRole("button", { name: "SOURCE_TITLE_0_1" })).toBeVisible();
      await expect(page.getByText(/Showing your saved roster/)).toBeVisible();
   });

test("a weekend source week becomes this week on Monday", async ({ page }) => {
   await page.addInitScript(() => localStorage.setItem("test-clock", localStorage.getItem("test-clock") ?? "2026-06-21T23:55:00+02:00"));
   await page.route("**/api/roster/weeks?*", (route) => {
      const url = new URL(route.request().url());
      return route.fulfill({ json: createShiftedRosterBatch(Number(url.searchParams.get("offset")), Number(url.searchParams.get("limit")), 1) });
   });
   await page.goto("/");
   await expect(page.locator(".weekbar__label")).toHaveText("Next week");
   await expect(page.getByRole("button", { name: "SOURCE_TITLE_1_1" })).toBeVisible();
   await page.evaluate(() => localStorage.setItem("test-clock", "2026-06-22T00:05:00+02:00"));
   await page.reload();
   await expect(page.locator(".weekbar__label")).toHaveText("This week");
   await expect(page.getByRole("heading", { name: /Week 26:/ })).toBeVisible();
   await expect(page.getByRole("button", { name: "SOURCE_TITLE_1_1" })).toBeVisible();
   await expect(page.locator(".status-changed, .status-cancelled")).toHaveCount(0);
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

test("reset can return to today's classes if a later response restores that week", async ({ page }) => {
   let shift = 1;
   await page.route("**/api/roster/weeks?*", (route) => {
      const url = new URL(route.request().url());
      return route.fulfill({ json: createShiftedRosterBatch(Number(url.searchParams.get("offset")), Number(url.searchParams.get("limit")), shift) });
   });
   await page.goto("/");
   await expect(page.getByRole("button", { name: "SOURCE_TITLE_1_1" })).toBeVisible();
   shift = 0;
   const response = page.waitForResponse((response) => response.url().includes("/api/roster/weeks?offset=0&"));
   await page.evaluate(() => window.dispatchEvent(new Event("online")));
   await response;
   await expect(page.getByRole("button", { name: "Previous week" })).toBeEnabled();
   await expect(page.locator(".weekbar__label")).toHaveText("Next week");
   await page.keyboard.press("Space");
   await expect(page.getByRole("button", { name: "SOURCE_TITLE_0_1" })).toBeVisible();
   await expect(page.locator(".grid-now-line")).toBeVisible();
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

test("reminder number field supports editing, cancellation, bounds and persistence", async ({ page }) => {
   await page.goto("/");
   await page.getByRole("button", { name: "Open settings" }).click();
   const field = page.getByRole("group", { name: "Minutes before class", exact: true });
   await expect(field.getByRole("button", { name: "Minutes before class: 5 min", exact: true })).toBeVisible();
   await field.getByRole("button", { name: "Increase Minutes before class", exact: true }).click();
   await field.getByRole("button", { name: "Minutes before class: 6 min", exact: true }).click();
   await field.getByRole("textbox").fill("99");
   await field.getByRole("textbox").press("Enter");
   await expect(field.getByRole("button", { name: "Minutes before class: 60 min", exact: true })).toBeFocused();
   await expect(field.getByRole("button", { name: "Increase Minutes before class", exact: true })).toBeDisabled();
   await field.getByRole("button", { name: "Minutes before class: 60 min", exact: true }).click();
   await field.getByRole("textbox").fill("12");
   await field.getByRole("textbox").press("Escape");
   await expect(page.getByRole("dialog", { name: "Preferences" })).toBeVisible();
   await expect(field.getByRole("button", { name: "Minutes before class: 60 min", exact: true })).toBeFocused();
   await page.reload();
   await page.getByRole("button", { name: "Open settings" }).click();
   await expect(field.getByRole("button", { name: "Minutes before class: 60 min", exact: true })).toBeVisible();
   await page.screenshot({ path: "test-results/reminder-settings.png", animations: "disabled" });
   await page.setViewportSize({ width: 390, height: 844 });
   await expect(field).toBeVisible();
   const control = field.getByRole("button", { name: "Minutes before class: 60 min", exact: true });
   await control.focus();
   await expect(control).toHaveCSS("border-radius", "6px");
   await page.screenshot({ path: "test-results/reminder-settings-mobile.png", animations: "disabled" });
});

test("class reminders deliver once independently of change alerts", async ({ page }) => {
   await page.addInitScript(() => {
      localStorage.setItem("test-clock", "2026-06-16T10:55:00+02:00");
      localStorage.setItem("roster-class-reminders", "true");
      class MockNotification {
         readonly title: string;
         static permission = "granted";
         constructor(title: string, options: NotificationOptions) {
            this.title = title;
            const messages = JSON.parse(localStorage.getItem("test-reminder-messages") ?? "[]") as string[];
            messages.push(options.body ?? "");
            localStorage.setItem("test-reminder-messages", JSON.stringify(messages));
         }
      }
      Object.defineProperty(window, "Notification", { configurable: true, value: MockNotification });
   });
   await page.goto("/");
   const messages = () => page.evaluate(() => JSON.parse(localStorage.getItem("test-reminder-messages") ?? "[]") as string[]);
   await expect.poll(messages).toEqual(["SOURCE_TITLE_0_2 is starting in 5 minutes in room SOURCE_ROOM"]);
   await page.getByRole("button", { name: "Next week" }).click();
   await page.getByRole("button", { name: "Open settings" }).click();
   await expect(page.getByRole("switch", { name: "Notify me before class starts" })).toHaveAttribute("aria-checked", "true");
   await expect(page.getByRole("switch", { name: "Notify me about class changes" })).toHaveAttribute("aria-checked", "false");
   await page.reload();
   await expect(page.locator(".grid-shell")).toBeVisible();
   await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
   await expect.poll(messages).toHaveLength(1);
   await page.getByRole("button", { name: "Open settings" }).click();
   await page.getByRole("switch", { name: "Enable devtools" }).click();
   const notifications = page.getByRole("group", { name: "Notification tests", exact: true });
   for (const name of ["Added", "Changed", "Cancelled", "Starting"]) {
      await notifications.getByRole("button", { name, exact: true }).click();
   }
   await expect
      .poll(messages)
      .toEqual([
         "SOURCE_TITLE_0_2 is starting in 5 minutes in room SOURCE_ROOM",
         "Testles was added: Tuesday 09:00",
         "Testles changed: A101 → B12",
         "Testles was cancelled: Tuesday 09:00",
         "Testles is starting in 5 minutes in room B12",
      ]);
   await expect(page.getByRole("group", { name: "Toast tests", exact: true }).getByRole("button")).toHaveCount(3);
   await page.setViewportSize({ width: 390, height: 844 });
   await notifications.scrollIntoViewIfNeeded();
   await page.screenshot({ path: "test-results/devtools-notifications-mobile.png", animations: "disabled" });
});
