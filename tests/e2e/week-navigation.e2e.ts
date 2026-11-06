import { expect, test, installCachedLastWeek, swipeWeek, createRosterBatch, createShiftedRosterBatch } from "../support/app";

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

   await page.keyboard.press("r");
   await expect(page.locator(".weekbar__label")).toHaveText("This week");
   await expect(page.getByRole("heading", { name: /Week 25:/ })).toBeVisible();
});

test("the week chooser selects whole weeks, jumps months and restores keyboard focus", async ({ page }) => {
   await page.goto("/");
   await expect(page.getByRole("button", { name: "Choose week", exact: true })).toHaveCount(0);
   // Exercise the retained WIP picker without exposing its entry in the shipped UI.
   await page.locator("[data-week-chooser-entry]").evaluate((element) => element.removeAttribute("hidden"));
   await page.getByRole("button", { name: "Choose week", exact: true }).click();
   const chooser = page.getByRole("dialog", { name: "Choose week" });
   await expect(chooser.locator('[data-monday="2026-06-08"]')).toBeDisabled();
   await expect(chooser.locator('[data-monday="2026-06-15"]')).toHaveAttribute("aria-pressed", "true");
   await expect(chooser.locator('[data-monday="2026-06-15"]')).toBeFocused();
   const calendarHeight = await chooser.evaluate((element) => (element as HTMLElement).offsetHeight);
   await expect(chooser.locator(".week-date-picker__actions")).toHaveCount(0);
   await expect(chooser.locator(".week-date-picker__scroll")).toHaveCSS("scroll-snap-type", "y mandatory");
   await chooser.getByRole("button", { name: "Choose month", exact: true }).click();
   expect(await chooser.evaluate((element) => (element as HTMLElement).offsetHeight)).toBeCloseTo(calendarHeight, 0);
   await chooser.getByRole("button", { name: "Next year", exact: true }).click();
   await chooser.getByRole("button", { name: "Back to weeks", exact: true }).click();
   await expect(chooser.getByRole("button", { name: "Choose month", exact: true })).toHaveText("June 2026");
   await chooser.getByRole("button", { name: "Choose month", exact: true }).click();
   await chooser.getByRole("button", { name: "Dec", exact: true }).click();
   await chooser.locator(".week-date-picker__scroll").evaluate((element) => {
      const labels = new Set<string>();
      const label = document.querySelector(".week-date-picker__month span");
      if (!label) throw new Error("Missing month label");
      const observer = new MutationObserver(() => {
         labels.add(label.textContent.trim());
         element.setAttribute("data-transition-months", [...labels].join("|"));
      });
      observer.observe(label, { childList: true, characterData: true, subtree: true });
   });
   await chooser.getByRole("button", { name: "Next month", exact: true }).click();
   await expect(chooser.getByRole("button", { name: "Choose month", exact: true })).toHaveText("January 2027");
   await expect
      .poll(() =>
         chooser.locator(".week-date-picker__scroll").evaluate((element) => {
            const rows = [...element.querySelectorAll<HTMLElement>(".week-date-picker__week")];
            return rows.find((row) => Math.abs(row.offsetTop - element.scrollTop) < 1)?.dataset["monday"];
         })
      )
      .toBe("2026-12-28");
   await expect(chooser.locator(".week-date-picker__scroll")).toHaveAttribute("data-transition-months", "January 2027");
   await expect(chooser.locator('[data-monday="2026-12-28"]')).toHaveAttribute("aria-label", /^Week 53:/);
   await expect(chooser.locator('[data-monday="2027-01-04"]')).toHaveAttribute("aria-label", /^Week 1:/);
   const scroller = chooser.locator(".week-date-picker__scroll");
   const rowHeight = await scroller.evaluate((element) => element.clientHeight / 5);
   expect(await chooser.locator('[data-monday="2026-12-28"]').evaluate((element) => (element as HTMLElement).offsetHeight)).toBeCloseTo(rowHeight, 0);
   await scroller.hover();
   await page.mouse.wheel(0, rowHeight * 2.3);
   await expect
      .poll(() =>
         scroller.evaluate((element) => {
            const rows = [...element.querySelectorAll<HTMLElement>(".week-date-picker__week")];
            return Math.min(...rows.map((row) => Math.abs(row.offsetTop - element.scrollTop)));
         })
      )
      .toBeLessThan(1);
   await chooser.getByRole("button", { name: "Choose month", exact: true }).click();
   await chooser.getByRole("button", { name: "Previous year", exact: true }).click();
   await chooser.getByRole("button", { name: "Aug", exact: true }).click();
   const augustWeek = chooser.getByRole("button", { name: /Week 32:/ });
   await augustWeek.focus();
   await page.keyboard.press("ArrowDown");
   await expect(chooser.getByRole("button", { name: /Week 33:/ })).toBeFocused();
   await page.keyboard.press("ArrowUp");
   await page.keyboard.press("Enter");
   await expect(page.getByRole("button", { name: "SOURCE_TITLE_7_1" })).toBeVisible();
   await expect(page.locator(".weekbar__label")).toHaveText("In 7 weeks");
   // Safari does not focus buttons on pointer clicks. Exercise keyboard focus restoration explicitly.
   await page.getByRole("button", { name: "Choose week", exact: true }).focus();
   await page.keyboard.press("Enter");
   await page.keyboard.press("Escape");
   await expect(chooser).toHaveCount(0);
   await expect(page.getByRole("button", { name: "Choose week", exact: true })).toBeFocused();
   await page.keyboard.press("Enter");
   await chooser.locator('[data-monday="2026-06-15"]').click();
   await expect(page.locator(".weekbar__label")).toHaveText("This week");
   await page.setViewportSize({ width: 320, height: 360 });
   await page.getByRole("button", { name: "Choose week", exact: true }).click();
   const bounds = await chooser.boundingBox();
   expect(bounds).not.toBeNull();
   expect(bounds?.y).toBeGreaterThanOrEqual(12);
   await expect
      .poll(async () => {
         const settled = await chooser.boundingBox();
         return settled ? settled.y + settled.height : Infinity;
      })
      .toBeLessThanOrEqual(348);
   await page.keyboard.press("Escape");
   await expect(chooser).toHaveCount(0);
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

test("week swipes stay inside the timetable and leave next-up gestures alone", async ({ page }) => {
   await page.goto("/");
   await expect(page.locator(".grid-class").first()).toBeVisible();
   await swipeWeek(page, "next", ".next-up");
   await swipeWeek(page, "next", ".app-toolbar");
   await page.evaluate(() => {
      const target = document.querySelector(".app-content-frame");
      if (!target) throw new Error("Missing timetable");
      const dispatch = (name: string, x: number, y: number, identifier: number) => {
         const event = new Event(name, { bubbles: true });
         Object.defineProperty(event, name === "touchend" ? "changedTouches" : "touches", { value: [{ identifier, target, clientX: x, clientY: y }] });
         target.dispatchEvent(event);
      };
      // A scroll that later drifts sideways must stay a scroll.
      dispatch("touchstart", 320, 300, 1);
      dispatch("touchmove", 310, 350, 1);
      dispatch("touchend", 120, 350, 1);
      // A different finger cannot finish the original gesture.
      dispatch("touchstart", 320, 300, 1);
      dispatch("touchend", 120, 300, 2);
   });
   await expect(page.locator(".weekbar__label")).toHaveText("This week");
   await swipeWeek(page, "next");
   await expect(page.locator(".weekbar__label")).toHaveText("Next week");
});

test("shift and an arrow moves by one roster batch", async ({ page }) => {
   await page.goto("/");
   await expect(page.locator(".grid-class").first()).toBeVisible();

   await page.keyboard.press("Shift+ArrowRight");
   await expect(page.locator(".weekbar__label")).toHaveText("In 5 weeks");

   await page.keyboard.press("Shift+ArrowLeft");
   await expect(page.locator(".weekbar__label")).toHaveText("This week");
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

test("week swipe navigation is disabled while an overlay is open", async ({ page }) => {
   await page.goto("/");
   await page.getByRole("button", { name: "Open settings" }).click();

   await swipeWeek(page, "next");

   await expect(page.locator(".weekbar__label")).toHaveText("This week");
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
   for (const key of ["r", "0"]) {
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

test("hidden weekend days open next week while the saved current week stays browsable", async ({ page }) => {
   await page.addInitScript(() => localStorage.setItem("test-clock", "2026-06-21T12:00:00+02:00"));
   await page.goto("/");
   await expect(page.getByRole("button", { name: "SOURCE_TITLE_1_1" })).toBeVisible();
   await expect(page.locator(".weekbar__content")).toHaveAttribute("data-week-position", "current");
   await page.getByRole("button", { name: "Previous week" }).click();
   await expect(page.getByRole("button", { name: "SOURCE_TITLE_0_1" })).toBeVisible();
   await expect(page.locator(".weekbar__content")).toHaveAttribute("data-week-position", "past");
   await page.keyboard.press("r");
   await expect(page.getByRole("button", { name: "SOURCE_TITLE_1_1" })).toBeVisible();
   await page.reload();
   await expect(page.getByRole("button", { name: "SOURCE_TITLE_1_1" })).toBeVisible();
   await page.getByRole("button", { name: "Previous week" }).click();
   await expect(page.getByRole("button", { name: "SOURCE_TITLE_0_1" })).toBeVisible();
});

for (const showSunday of [false, true]) {
   test(`a weekend class follows day visibility for startup and reset, Sunday visible ${String(showSunday)}`, async ({ page }) => {
      await page.addInitScript((visible) => {
         localStorage.setItem("test-clock", "2026-06-21T08:00:00+02:00");
         localStorage.setItem("roster-shown-weekdays", visible ? "1,2,3,4,5,6,7" : "1,2,3,4,5");
      }, showSunday);
      await page.route("**/api/roster/weeks?*", (route) => {
         const url = new URL(route.request().url());
         const batch = createRosterBatch(Number(url.searchParams.get("offset")), Number(url.searchParams.get("limit")));
         const current = batch.weeks.find((week) => week.week.offset === 0);
         if (current) current.classes = current.classes.slice(0, 1).map((item) => ({ ...item, start: "2026-06-21T09:00:00", end: "2026-06-21T10:00:00" }));
         return route.fulfill({ json: batch });
      });
      await page.goto("/");
      const homeLabel = showSunday ? "This week" : "Next week";
      await expect(page.locator(".weekbar__label")).toHaveText(homeLabel);
      await expect(page.locator(".weekbar__content")).toHaveAttribute("data-week-position", "current");
      await page.keyboard.press("3");
      await expect(page.locator(".weekbar__label")).toHaveText("In 3 weeks");
      await page.locator(".weekbar__content").click();
      await expect(page.locator(".weekbar__label")).toHaveText(homeLabel);
   });
}

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

for (const weekendVisible of [false, true]) {
   test(`empty vacation weeks follow day visibility on startup and reset, weekends visible ${String(weekendVisible)}`, async ({ page }) => {
      await page.addInitScript((visible) => {
         localStorage.setItem("test-clock", "2026-06-21T12:00:00+02:00");
         localStorage.setItem("roster-shown-weekdays", visible ? "1,2,3,4,5,6,7" : "1,2,3,4,5");
      }, weekendVisible);
      await page.route("**/api/roster/weeks?*", (route) => {
         const url = new URL(route.request().url());
         const batch = createRosterBatch(Number(url.searchParams.get("offset")), Number(url.searchParams.get("limit")));
         batch.weeks.forEach((week) => {
            if (week.week.offset < 7) week.classes = [];
         });
         return route.fulfill({ json: batch });
      });
      await page.goto("/");
      const homeLabel = weekendVisible ? "This week" : "Next week";
      const weekTitle = weekendVisible ? /Week 25:/ : /Week 26:/;
      await expect(page.locator(".weekbar__label")).toHaveText(homeLabel);
      await expect(page.getByRole("heading", { name: weekTitle })).toBeVisible();
      await expect(page.locator(".grid-header__day")).toHaveCount(weekendVisible ? 7 : 5);
      await expect(page.locator(".grid-class")).toHaveCount(0);
      await page.keyboard.press("3");
      await expect(page.locator(".weekbar__label")).toHaveText("In 3 weeks");
      await page.keyboard.press("r");
      await expect(page.locator(".weekbar__label")).toHaveText(homeLabel);
      await expect(page.getByRole("heading", { name: weekTitle })).toBeVisible();
   });
}

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
      await expect(page.getByText(/Showing your saved roster/)).toHaveCount(0);
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
      await expect(page.getByText(/Showing your saved roster/)).toHaveCount(0);
   });

test("a weekend source week becomes this week on Monday", async ({ page }) => {
   await page.addInitScript(() => {
      localStorage.setItem("test-clock", localStorage.getItem("test-clock") ?? "2026-06-21T23:55:00+02:00");
      localStorage.setItem("roster-shown-weekdays", "1,2,3,4,5,6,7");
   });
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
   await page.keyboard.press("r");
   await expect(page.getByRole("button", { name: "SOURCE_TITLE_0_1" })).toBeVisible();
   await expect(page.locator(".grid-now-line")).toBeVisible();
});

for (const mode of ["smart", "single"] as const)
   test(`Saturday navigation applies ${mode} folding to the cached calendar week`, async ({ page }) => {
      await page.addInitScript((foldingMode) => {
         localStorage.setItem("roster-view-mode", "agenda");
         localStorage.setItem("roster-agenda-folding", foldingMode);
      }, mode);
      let shift = 0;
      await page.route("**/api/roster/weeks?*", (route) => {
         const url = new URL(route.request().url());
         return route.fulfill({ json: createShiftedRosterBatch(Number(url.searchParams.get("offset")), Number(url.searchParams.get("limit")), shift) });
      });
      await page.goto("/");
      await expect(page.getByRole("button", { name: "SOURCE_TITLE_0_1" })).toBeVisible();
      shift = 1;
      await page.evaluate(() => localStorage.setItem("test-clock", "2026-06-20T12:00:00+02:00"));
      await page.reload();
      await expect(page.locator(".weekbar__label")).toHaveText("Next week");
      if (mode === "single") {
         await expect(page.locator('.day-group__header[aria-expanded="true"]')).toHaveCount(1);
         await expect(page.getByRole("button", { name: "SOURCE_TITLE_1_1" })).toBeVisible();
      }
      await page.getByRole("button", { name: "Previous week" }).click();
      await expect(page.locator(".weekbar__label")).toHaveText("This week");
      if (mode === "single") await expect(page.locator('.day-group__header[aria-expanded="true"]')).toHaveCount(0);
      else await expect(page.getByRole("button", { name: "SOURCE_TITLE_0_1" })).toBeVisible();
      await expect(page.getByText(/Showing your saved roster/)).toHaveCount(0);
   });

test("returning to a week restores its reading position", async ({ page }) => {
   await page.setViewportSize({ width: 375, height: 400 });
   await page.addInitScript(() => {
      localStorage.setItem("roster-view-mode", "agenda");
   });
   await page.goto("/");
   await expect(page.locator(".day-group").first()).toBeVisible();

   await page.getByRole("button", { name: "Next week" }).click();
   await expect(page.getByRole("heading", { name: /Week 26:/ })).toBeVisible();
   await expect.poll(() => page.evaluate(() => window.scrollY), "a fresh week starts at the top").toBe(0);

   await page.getByRole("button", { name: "Previous week" }).click();
   await expect(page.getByRole("heading", { name: /Week 25:/ })).toBeVisible();
   const scrolledTo = await page.evaluate(() => {
      window.scrollTo(0, 400);
      return window.scrollY;
   });
   expect(scrolledTo).toBeGreaterThan(0);

   await page.getByRole("button", { name: "Next week" }).click();
   await expect(page.getByRole("heading", { name: /Week 26:/ })).toBeVisible();
   await page.getByRole("button", { name: "Previous week" }).click();
   await expect(page.getByRole("heading", { name: /Week 25:/ })).toBeVisible();
   await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(scrolledTo);
});

test("week navigation is announced to screen readers", async ({ page }) => {
   await page.goto("/");
   await expect(page.getByRole("heading", { name: /Week 25:/ })).toBeVisible();

   await page.getByRole("button", { name: "Next week", exact: true }).click();
   await expect(page.getByRole("status")).toHaveText("Next week, Week 26: 22 Jun - 28 Jun");

   await page.getByRole("button", { name: "Next week", exact: true }).click();
   await expect(page.getByRole("status")).toHaveText("In 2 weeks, Week 27: 29 Jun - 5 Jul");
});
