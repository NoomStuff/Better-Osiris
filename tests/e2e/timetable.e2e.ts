import { THEMES_BY_MODE } from "../../src/styles/themes/registry";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, createRosterBatch } from "../support/app";

test("manual agenda folding stays absolute when the automatic day changes", async ({ page }) => {
   await page.addInitScript(() => {
      localStorage.setItem("roster-devtools-enabled", "true");
      localStorage.setItem("roster-devtools-time-override", "2026-06-16T09:45:00+02:00");
   });
   await page.goto("/");
   await page.getByRole("button", { name: "Agenda view" }).click();
   const tuesday = page.locator('.day-group[data-day="2026-06-16"] .day-group__header');
   await expect(tuesday).toHaveAttribute("aria-expanded", "true");
   await tuesday.click();
   await expect(tuesday).toHaveAttribute("aria-expanded", "false");
   await page.getByRole("button", { name: "Open settings" }).click();
   await page.getByLabel("Fake date").fill("2026-06-17");
   await page.getByRole("dialog", { name: "Preferences" }).getByRole("button", { name: "Close settings" }).click();
   await expect(page.getByRole("dialog", { name: "Preferences" })).toBeHidden();
   await expect(tuesday).toHaveAttribute("aria-expanded", "false");
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

test("space activates a focused schoolClass without moving the week", async ({ page }) => {
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
   await expect(teacher).toContainText("Teacher");
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

test("agenda progress ticks without measuring unchanged class geometry", async ({ page }) => {
   await page.goto("/");
   await page.getByRole("button", { name: "Agenda view" }).click();
   const progress = page.locator(".agenda-current-indicator__progress");
   await expect(page.locator(".agenda-current-indicator")).toHaveAttribute("data-visible", "true");
   await expect(page.locator(".app-content-frame")).toHaveAttribute("data-week-transition", "settled");
   await page.evaluate(async () => {
      await document.fonts.ready;
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
   });
   const before = await progress.evaluate((element) => element.getAttribute("style"));
   await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/unbound-method -- The wrapper passes its own receiver with call.
      const original = Element.prototype.getBoundingClientRect;
      Element.prototype.getBoundingClientRect = function () {
         if (this.matches(".day-group__body-inner, [data-current-segment]")) localStorage.setItem("test-geometry-measured", "true");
         return original.call(this);
      };
      (Date as DateConstructor & { setTestTime: (iso: string) => void }).setTestTime("2026-06-16T10:00:00+02:00");
   });
   await expect.poll(() => progress.evaluate((element) => element.getAttribute("style"))).not.toBe(before);
   expect(await page.evaluate(() => localStorage.getItem("test-geometry-measured"))).toBeNull();
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

test("desktop grid and mobile agenda match their visual baselines", async ({ page, browserName }) => {
   test.skip(browserName !== "chromium", "Visual baselines use Chromium for deterministic rendering.");

   // Viewport screenshots instead of .shell element shots: the mobile bar and the next-up card
   // are position-fixed, and element screenshots do not composite fixed chrome.
   await page.setViewportSize({ width: 1280, height: 720 });
   await page.goto("/");
   await page.evaluate(() => document.fonts.ready);
   await expect(page).toHaveScreenshot("desktop-grid.png", { animations: "disabled" });
   await page.locator("[data-week-chooser-entry]").evaluate((element) => element.removeAttribute("hidden"));
   await page.getByRole("button", { name: "Choose week", exact: true }).click();
   await expect(page.getByRole("dialog", { name: "Choose week" })).toHaveScreenshot("desktop-week-picker.png", { animations: "disabled" });
   await page.keyboard.press("Escape");
   await expect(page.getByRole("dialog", { name: "Choose week" })).toHaveCount(0);
   await page.locator("[data-week-chooser-entry]").evaluate((element) => element.setAttribute("hidden", ""));

   await page.setViewportSize({ width: 390, height: 844 });
   await page.getByRole("button", { name: "Agenda view" }).click();
   await expect(page).toHaveScreenshot("mobile-agenda.png", { animations: "disabled" });
   await page.locator("[data-week-chooser-entry]").evaluate((element) => element.removeAttribute("hidden"));
   await page.getByRole("button", { name: "Choose week", exact: true }).click();
   await expect(page.getByRole("dialog", { name: "Choose week" })).toHaveScreenshot("mobile-week-picker.png", { animations: "disabled" });
});

test("the mobile hour grid fits the viewport and keeps the next-up handle above its card", async ({ page }) => {
   await page.setViewportSize({ width: 390, height: 844 });
   await page.goto("/");

   await expect(page.locator("html")).toHaveAttribute("data-page-scrollable", "false");
   await expect
      .poll(() =>
         page.evaluate(() => ({
            viewportHeight: window.visualViewport?.height ?? window.innerHeight,
            documentHeight: Math.max(document.documentElement.scrollHeight, document.body.scrollHeight),
         }))
      )
      .toEqual({ viewportHeight: 844, documentHeight: 844 });

   const handle = page.locator(".next-up__handle");
   const card = page.locator(".next-up__card");
   await expect(handle.locator(".next-up__lead")).toHaveText("Now");
   await handle.click();
   await expect(card).toBeVisible();
   await expect(card.locator(".next-up__lead")).toHaveText("Ends 10:30");
   await expect(card.locator(".next-up__elapsed")).toHaveCount(0);

   await expect
      .poll(async () => {
         const handleBox = await handle.boundingBox();
         const cardBox = await card.boundingBox();
         return handleBox && cardBox ? cardBox.y - (handleBox.y + handleBox.height) : -1;
      })
      .toBeGreaterThan(0);

   const cardBox = await card.boundingBox();
   if (!cardBox) throw new Error("Expected the open next-up card to have a bounding box.");
   await page.mouse.move(cardBox.x + cardBox.width / 2, cardBox.y + cardBox.height / 2);
   await page.mouse.down();
   await page.mouse.move(cardBox.x + cardBox.width / 2, cardBox.y + cardBox.height / 2 + 65);
   await expect(handle).toHaveCSS("opacity", "1");
   expect(Number(await card.evaluate((element) => getComputedStyle(element).opacity))).toBeLessThan(0.75);
   await page.mouse.up();
});

test("next-up cancellation and lost capture discard the gesture without activating", async ({ page }) => {
   await page.goto("/");
   const handle = page.locator(".next-up__handle");
   await expect(handle).toHaveAttribute("aria-expanded", "false");
   await page.evaluate(() => {
      const target = document.querySelector(".next-up__handle");
      if (!(target instanceof HTMLElement)) throw new Error("Missing next-up handle");
      target.setPointerCapture = () => undefined;
      target.releasePointerCapture = () => undefined;
   });
   await handle.dispatchEvent("pointerdown", { pointerId: 1, clientY: 300 });
   await handle.dispatchEvent("pointercancel", { pointerId: 1 });
   await expect(handle).toHaveAttribute("aria-expanded", "false");
   await handle.dispatchEvent("pointerdown", { pointerId: 2, clientY: 300 });
   await handle.dispatchEvent("pointermove", { pointerId: 2, clientY: 220 });
   await expect(page.locator(".next-up")).toHaveAttribute("data-dragging", "true");
   await handle.dispatchEvent("lostpointercapture", { pointerId: 2 });
   await expect(page.locator(".next-up")).toHaveAttribute("data-dragging", "false");
   await expect(handle).toHaveAttribute("aria-expanded", "false");
   await handle.focus();
   await page.keyboard.press("Enter");
   await expect(handle).toHaveAttribute("aria-expanded", "true");
});

test("unused browser shortcuts and composing or handled keys remain unclaimed", async ({ page }) => {
   await page.goto("/");
   await expect(page.locator(".grid-class").first()).toBeVisible();
   expect(
      await page.evaluate(() => {
         const events = [
            new KeyboardEvent("keydown", { key: "9", ctrlKey: true, cancelable: true }),
            new KeyboardEvent("keydown", { key: "ArrowRight", isComposing: true, cancelable: true }),
            new KeyboardEvent("keydown", { key: "ArrowRight", cancelable: true }),
         ];
         events[2]?.preventDefault();
         return events.map((event) => {
            window.dispatchEvent(event);
            return event.defaultPrevented;
         });
      })
   ).toEqual([false, false, true]);
   await expect(page.locator(".weekbar__label")).toHaveText("This week");
});

test("the desktop app fills the viewport", async ({ page }) => {
   await page.setViewportSize({ width: 1280, height: 720 });
   await page.goto("/");

   await expect
      .poll(() =>
         page.evaluate(() => {
            const appHeight = document.querySelector("#app")?.getBoundingClientRect().height ?? 0;
            return Math.abs(appHeight - window.innerHeight);
         })
      )
      .toBeLessThanOrEqual(1);
   await expect
      .poll(() =>
         page.evaluate(() => {
            const app = document.querySelector("#app");
            const frame = document.querySelector(".app-content-frame");
            if (!app || !frame) return null;
            const appRect = app.getBoundingClientRect();
            const frameRect = frame.getBoundingClientRect();
            return Math.round(appRect.bottom - frameRect.bottom);
         })
      )
      .toBe(20);

   await page.getByRole("radio", { name: "30m" }).click();
   await expect.poll(() => page.locator("#app").evaluate((app) => app.getBoundingClientRect().height)).toBeGreaterThan(720);
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

test("the browser back button closes overlays and UI closes hand the history back", async ({ page }) => {
   await page.goto("/");
   await expect(page.getByRole("heading", { name: /Week 25:/ })).toBeVisible();
   const baseHistoryLength = await page.evaluate(() => history.length);

   // Opening an overlay claims one history entry, and back spends it on closing the drawer.
   await page.getByRole("button", { name: /SOURCE_TITLE_0_1/ }).click();
   const drawer = page.getByRole("dialog", { name: "Class details" });
   await expect(drawer).toBeVisible();
   await expect.poll(() => page.evaluate(() => history.length)).toBe(baseHistoryLength + 1);

   await page.goBack();
   await expect(drawer).toBeHidden();
   await expect(page.locator(".weekbar__label")).toHaveText("This week");

   // Stacked dialogs close one per back press, newest first.
   await page.getByRole("button", { name: "Open settings" }).click();
   const settings = page.getByRole("dialog", { name: "Preferences" });
   await expect(settings).toBeVisible();
   await settings.getByRole("region", { name: "Roster access" }).getByRole("button", { name: "Remove" }).click();
   const confirmation = page.getByRole("alertdialog", { name: "Remove bearer token?" });
   await expect(confirmation).toBeVisible();
   await expect.poll(() => page.evaluate(() => history.length)).toBe(baseHistoryLength + 2);

   await page.goBack();
   await expect(confirmation).toBeHidden();
   await expect(settings).toBeVisible();

   await page.goBack();
   await expect(settings).toBeHidden();
   await expect(page.locator(".weekbar__label")).toHaveText("This week");

   // Closing through the UI must give its entry back too, so the next back leaves the page.
   await page.getByRole("button", { name: /SOURCE_TITLE_0_1/ }).click();
   await expect(drawer).toBeVisible();
   await drawer.getByRole("button", { name: "Close", exact: true }).click();
   await expect(drawer).toBeHidden();
   // The panel hands its entry back with an asynchronous history.back() after unmounting. Pressing
   // back before that traversal lands would race it, so wait until the overlay entry is gone.
   await expect.poll(() => page.evaluate(() => (history.state as Record<string, unknown> | null)?.["betterOsirisOverlay"] ?? null)).toBeNull();
   await page.goBack();
   await expect(page).toHaveURL("about:blank");
});

test("a reload with an overlay open does not swallow the next back press", async ({ page }) => {
   await page.goto("/");
   await expect(page.getByRole("heading", { name: /Week 25:/ })).toBeVisible();
   await page.getByRole("button", { name: /SOURCE_TITLE_0_1/ }).click();
   await expect(page.getByRole("dialog", { name: "Class details" })).toBeVisible();

   await page.reload();
   await expect(page.getByRole("heading", { name: /Week 25:/ })).toBeVisible();

   // Startup handed the dead overlay entry back, so back immediately leaves the page again.
   await page.goBack();
   await expect(page).toHaveURL("about:blank");
});
