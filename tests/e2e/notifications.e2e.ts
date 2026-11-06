import { expect, test, installFixedClock, mockAppApis, createRosterBatch } from "../support/app";

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

test("notification delivery uses a worker and deduplicates a change across tabs", async ({ page, context }) => {
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
   let firstEnded = false;
   const second = await context.newPage();
   await installFixedClock(second);
   await mockAppApis(second);
   for (const tab of [page, second]) {
      await tab.route("**/api/roster/weeks?*", (route) => {
         const url = new URL(route.request().url());
         const batch = createRosterBatch(Number(url.searchParams.get("offset")), Number(url.searchParams.get("limit")));
         const first = batch.weeks[0]?.classes[0];
         if (changed && first) first.room = "NEW_ROOM";
         if (firstEnded && first) {
            first.status = "cancelled";
            const next = batch.weeks[0]?.classes[1];
            if (next) next.room = "LATEST_ROOM";
         }
         return route.fulfill({ json: batch });
      });
      await tab.goto("/");
      await expect(tab.locator(".grid-class").first()).toBeVisible();
   }
   changed = true;
   await Promise.all([page, second].map((tab) => tab.evaluate(() => window.dispatchEvent(new Event("online")))));
   for (const tab of [page, second]) await expect(tab.locator(".grid-class.status-changed")).toHaveCount(1);
   await expect.poll(() => deliveries).toEqual(["SOURCE_TITLE_0_1 changed: SOURCE_ROOM → NEW_ROOM"]);
   firstEnded = true;
   for (const tab of [page, second]) {
      await tab.evaluate(() => {
         (Date as DateConstructor & { setTestTime: (iso: string) => void }).setTestTime("2026-06-16T10:30:00+02:00");
      });
   }
   await Promise.all([page, second].map((tab) => tab.evaluate(() => window.dispatchEvent(new Event("online")))));
   for (const tab of [page, second]) await expect(tab.locator(".grid-class.status-cancelled")).toHaveCount(1);
   await expect.poll(() => deliveries).toEqual(["SOURCE_TITLE_0_1 changed: SOURCE_ROOM → NEW_ROOM", "SOURCE_TITLE_0_2 changed: SOURCE_ROOM → LATEST_ROOM"]);
   await second.close();
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

test("constructor reminders deliver once independently of change alerts when worker delivery is unavailable", async ({ page }) => {
   await page.addInitScript(() => {
      localStorage.setItem("test-clock", "2026-06-16T10:55:00+02:00");
      localStorage.setItem("roster-class-reminders", "true");
      class MockNotification {
         readonly title: string;
         readonly tag: string;
         readonly data: unknown;
         close() {
            localStorage.setItem("test-closed-notification", this.tag);
         }
         static permission = "granted";
         constructor(title: string, options: NotificationOptions) {
            this.title = title;
            this.tag = options.tag ?? "";
            this.data = options.data as unknown;
            const messages = JSON.parse(localStorage.getItem("test-reminder-messages") ?? "[]") as string[];
            messages.push(options.body ?? "");
            localStorage.setItem("test-reminder-messages", JSON.stringify(messages));
         }
      }
      Object.defineProperty(window, "Notification", { configurable: true, value: MockNotification });
      Object.defineProperty(navigator, "serviceWorker", {
         configurable: true,
         value: {
            register: () => Promise.reject(new Error("Worker notifications unavailable")),
            getRegistration: () => Promise.resolve(undefined),
         },
      });
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
   for (const [groupName, labels] of [
      ["Grouped notification tests", ["Added group", "Changed group", "Cancelled group"]],
      ["Notification timing tests", ["During class", "After class", "Expires in 5s"]],
      ["Repeated notification tests", ["Changed twice", "Reverted"]],
   ] as const) {
      const group = page.getByRole("group", { name: groupName, exact: true });
      for (const name of labels) await group.getByRole("button", { name, exact: true }).click();
   }
   await expect.poll(messages).toHaveLength(15);
   const examples = await messages();
   expect(examples.slice(5, 8)).toEqual(["3 classes were added", "3 classes were changed", "3 classes were cancelled"]);
   expect(examples.slice(-4)).toEqual([
      "Testles changed: A101 → B12",
      "Testles changed: B12 → C04",
      "Testles changed: A101 → B12",
      "Testles changed: B12 → A101",
   ]);
   await expect.poll(() => page.evaluate(() => localStorage.getItem("test-closed-notification")), { timeout: 8_000 }).toContain("devtools-expires:");
   await expect(page.getByRole("group", { name: "Toast tests", exact: true }).getByRole("button")).toHaveCount(3);
});

test("worker reminders replace earlier reminders, expire on resume and clear when disabled", async ({ page }) => {
   await page.route("**/api/roster/weeks?*", (route) => {
      const url = new URL(route.request().url());
      const batch = createRosterBatch(Number(url.searchParams.get("offset")), Number(url.searchParams.get("limit")));
      for (const week of batch.weeks) {
         const first = week.classes[0];
         if (first) first.end = first.end.replace("10:30", "11:00");
      }
      return route.fulfill({ json: batch });
   });
   await page.addInitScript(() => {
      localStorage.setItem("test-clock", "2026-06-16T08:55:00+02:00");
      localStorage.setItem("roster-class-reminders", "true");
      Object.defineProperty(window, "Notification", { value: { permission: "granted" } });
      const active: { tag: string; data: unknown; close: () => void }[] = [];
      const registration = {
         showNotification: (_title: string, options: NotificationOptions) => {
            const notification = {
               tag: options.tag ?? "",
               data: options.data as unknown,
               close: () => {
                  const index = active.indexOf(notification);
                  if (index !== -1) active.splice(index, 1);
                  localStorage.setItem("test-active-notifications", String(active.length));
               },
            };
            localStorage.setItem("test-latest-reminder", options.body ?? "");
            active.push(notification);
            localStorage.setItem("test-active-notifications", String(active.length));
            return Promise.resolve();
         },
         getNotifications: () => Promise.resolve([...active]),
      };
      Object.defineProperty(navigator, "serviceWorker", {
         value: {
            register: () => Promise.resolve(registration),
            ready: Promise.resolve(registration),
            getRegistration: () => Promise.resolve(registration),
         },
      });
   });
   await page.goto("/");
   const count = () => page.evaluate(() => localStorage.getItem("test-active-notifications"));
   await expect.poll(count).toBe("1");
   await expect.poll(() => page.evaluate(() => localStorage.getItem("test-latest-reminder"))).toContain("SOURCE_TITLE_0_1");
   await page.evaluate(() => {
      Date.now = () => Date.parse("2026-06-16T10:55:00+02:00");
      document.dispatchEvent(new Event("visibilitychange"));
   });
   await expect.poll(() => page.evaluate(() => localStorage.getItem("test-latest-reminder"))).toContain("SOURCE_TITLE_0_2");
   await expect.poll(count).toBe("1");
   await page.evaluate(() => {
      Date.now = () => Date.parse("2026-06-16T18:00:00+02:00");
      document.dispatchEvent(new Event("visibilitychange"));
   });
   await expect.poll(count).toBe("0");
   await page.evaluate(() => {
      localStorage.removeItem("roster-notification-deliveries-v1");
      Date.now = () => Date.parse("2026-06-16T10:55:00+02:00");
      document.dispatchEvent(new Event("visibilitychange"));
   });
   await expect.poll(count).toBe("1");
   await page.getByRole("button", { name: "Open settings" }).click();
   await page.getByRole("switch", { name: "Notify me before class starts" }).click();
   await expect.poll(count).toBe("0");
});
