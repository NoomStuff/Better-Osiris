import { expect, test, OSIRIS_BEARER_TOKEN_HELP_URL, installCachedLastWeek, createRosterBatch, createShiftedRosterBatch } from "../support/app";

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
   let releaseReset: () => void = () => undefined;
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

test("saving a replacement token refreshes roster data without reloading the page", async ({ page }) => {
   let rosterRequestCount = 0;
   let holdReplacementRequest = false;
   let releaseReplacementRequest: () => void = () => undefined;
   const replacementRequestGate = new Promise<void>((resolve) => {
      releaseReplacementRequest = resolve;
   });
   page.on("request", (request) => {
      if (request.url().includes("/api/roster/weeks?")) {
         rosterRequestCount += 1;
      }
   });
   await page.route("**/api/settings/osiris-token", async (route) => {
      if (route.request().method() === "PUT" && holdReplacementRequest) {
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
   const tokenSave = page.waitForResponse((response) => response.url().includes("/api/settings/osiris-token") && response.request().method() === "PUT");
   await saveButton.click();

   await expect(settings.getByRole("button", { name: "Verifying..." })).toBeDisabled();
   await expect(tokenInput).toHaveValue("Bearer replacement-token");
   releaseReplacementRequest();
   await tokenSave;

   await expect.poll(() => rosterRequestCount).toBe(initialRequestCount + 1);
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

test("an expired saved token shows the expired-token screen until a fresh one is saved", async ({ page }) => {
   let tokenRejected = false;
   let hasCustomToken = true;
   let homeBatchLoaded = false;
   await page.route("**/api/settings/osiris-token", async (route) => {
      if (route.request().method() === "PUT") {
         hasCustomToken = true;
      }

      await route.fulfill({
         status: 200,
         contentType: "application/json",
         body: JSON.stringify({
            hasCustomToken,
            hasBearerToken: hasCustomToken,
            contextId: hasCustomToken ? "test-context" : null,
            ...(route.request().method() === "PUT" ? { verifiedBatch: createRosterBatch(0, 5) } : {}),
         }),
      });
   });
   await page.route("**/api/roster/weeks?*", async (route) => {
      const url = new URL(route.request().url());
      const offset = Number(url.searchParams.get("offset") ?? "0");
      const limit = Number(url.searchParams.get("limit") ?? "5");
      if (offset === 0 && !homeBatchLoaded) {
         homeBatchLoaded = true;
         await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify(createRosterBatch(offset, limit)),
         });
         return;
      }

      if (!tokenRejected && offset === 0) {
         // The home week's refresh is where the user meets the expired token; the server clears the dead cookie.
         tokenRejected = true;
         hasCustomToken = false;
      }

      if (!tokenRejected || hasCustomToken) {
         await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify(createRosterBatch(offset, limit)),
         });
         return;
      }

      await route.fulfill({
         status: 401,
         contentType: "application/json",
         body: JSON.stringify({ code: "UPSTREAM_AUTH_FAILED", error: "OSIRIS rejected the saved token.", retryable: false }),
      });
   });

   await page.goto("/");
   await expect(page.locator(".grid-class", { hasText: "SOURCE_TITLE_0_1" })).toBeVisible();

   // A refresh of the home week fails; the settings refresh it triggers clears the cookie.
   // The expired screen must survive both and stay up until a fresh token is saved.
   await page.evaluate(() => window.dispatchEvent(new Event("online")));
   await expect(page.getByRole("heading", { name: "Bearer token expired" })).toBeVisible();
   await expect(page.getByText("OSIRIS no longer accepts your saved token.")).toBeVisible();

   const overlay = page.locator(".roster-overlay-state");
   await overlay.getByLabel("Bearer token").fill("Bearer fresh-token");
   await overlay.getByRole("button", { name: "Load roster" }).click();

   await expect(page.getByRole("heading", { name: "Bearer token expired" })).toBeHidden();
   await expect(page.locator(".grid-class", { hasText: "SOURCE_TITLE_0_1" })).toBeVisible();
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
   await expect(page.locator(".grid-shell")).toHaveAttribute("inert", "");
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
   let releaseRoster: () => void = () => undefined;
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
         await rosterGate;
      }
      await route.fulfill({
         status: 200,
         contentType: "application/json",
         body: JSON.stringify({
            hasCustomToken: hasToken,
            hasBearerToken: hasToken,
            contextId: hasToken ? "test-context" : null,
            ...(route.request().method() === "PUT" ? { verifiedBatch: createRosterBatch(0, 5) } : {}),
         }),
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

test("a complete short roster enables Smart preferences", async ({ page }) => {
   await page.route("**/api/roster/weeks?*", (route) => {
      const url = new URL(route.request().url());
      const batch = createShiftedRosterBatch(Number(url.searchParams.get("offset")), Number(url.searchParams.get("limit")), 0);
      batch.weeks = batch.weeks.slice(0, 1);
      return route.fulfill({ json: batch });
   });
   await page.goto("/");
   await expect(page.locator(".grid-class").first()).toBeVisible();
   await page.getByRole("button", { name: "Open settings" }).click();
   await expect(page.getByRole("region", { name: "Grid hours" }).getByRole("button", { name: "Smart", exact: true })).toBeEnabled();
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
