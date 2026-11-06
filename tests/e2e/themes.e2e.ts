import { THEMES_BY_MODE } from "../../src/styles/themes/registry";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "../support/app";

test("a fresh theme follows the system color scheme", async ({ page }) => {
   await page.emulateMedia({ colorScheme: "light" });
   await page.goto("/");

   await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
   await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute("content", "hsl(216 71.4% 98.6%)");
});

test("the theme picker starts on the saved theme category and remembers the last browsed tab", async ({ page }) => {
   await page.addInitScript(() => localStorage.setItem("roster-theme", "light"));
   await page.goto("/");
   await page.getByRole("button", { name: "Open settings" }).click();
   await expect(page.getByRole("radio", { name: "Light", exact: true })).toHaveAttribute("aria-checked", "true");
   await expect(page.getByRole("button", { name: "Light", exact: true })).toBeVisible();
   await page.getByRole("radio", { name: "Dark", exact: true }).click();

   await page.locator(".settings-dialog__header").getByRole("button", { name: "Close settings" }).click();
   await page.getByRole("button", { name: "Open settings" }).click();

   await expect(page.getByRole("radio", { name: "Dark", exact: true })).toHaveAttribute("aria-checked", "true");
   await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
   await page.locator(".settings-dialog__header").getByRole("button", { name: "Close settings" }).click();
   await expect(page.getByRole("dialog", { name: "Preferences" })).toBeHidden();
   await page.emulateMedia({ colorScheme: "light" });
   await page.getByRole("button", { name: "Open settings" }).click();
   await expect(page.getByRole("radio", { name: "Dark", exact: true })).toHaveAttribute("aria-checked", "true");
});

for (const reducedMotion of ["no-preference", "reduce"] as const) {
   test(`theme picker restores each tab's scroll and centers selections with motion ${reducedMotion}`, async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.emulateMedia({ reducedMotion });
      await page.addInitScript(() => localStorage.setItem("roster-theme", "dusk"));
      await page.goto("/");
      await page.getByRole("button", { name: "Open settings" }).click();
      const scroller = page.locator(".scrollable-row__scroller").filter({ has: page.getByRole("group", { name: "Color theme" }) });
      const position = () => scroller.evaluate((element) => element.scrollLeft);
      const expectedCenter = (name: string) =>
         page.getByRole("button", { name, exact: true }).evaluate((element) => {
            const container = element.closest(".scrollable-row__scroller");
            if (!container) throw new Error("Theme scroller is missing");
            const bounds = element.getBoundingClientRect();
            const target = container.scrollLeft + bounds.left - container.getBoundingClientRect().left + bounds.width / 2 - container.clientWidth / 2;
            return Math.max(0, Math.min(target, container.scrollWidth - container.clientWidth));
         });
      await expect.poll(async () => Math.abs((await position()) - (await expectedCenter("Dusk")))).toBeLessThan(2);
      await page.getByRole("button", { name: "Ember", exact: true }).click();
      await expect.poll(async () => Math.abs((await position()) - (await expectedCenter("Ember")))).toBeLessThan(2);

      await scroller.evaluate((element) => {
         element.scrollLeft = 120;
      });
      await expect.poll(async () => Math.abs((await position()) - 120)).toBeLessThan(1);
      await page.getByRole("radio", { name: "Light", exact: true }).click();
      await scroller.evaluate((element) => {
         element.scrollLeft = 240;
      });
      await expect.poll(async () => Math.abs((await position()) - 240)).toBeLessThan(1);
      await page.getByRole("dialog", { name: "Preferences" }).getByRole("button", { name: "Close settings", exact: true }).click();
      await expect(page.getByRole("dialog", { name: "Preferences" })).toBeHidden();
      await page.getByRole("button", { name: "Open settings" }).click();
      await expect(page.getByRole("radio", { name: "Light", exact: true })).toHaveAttribute("aria-checked", "true");
      await expect.poll(async () => Math.abs((await position()) - 240)).toBeLessThan(1);
      await page.getByRole("radio", { name: "Dark", exact: true }).click();
      await expect.poll(async () => Math.abs((await position()) - 120)).toBeLessThan(1);
      await expect(page.getByRole("button", { name: "Ember", exact: true })).toHaveAttribute("aria-pressed", "true");

      // End tiles cannot reach the center, so use the nearest available position.
      await page.getByRole("button", { name: "Contrast", exact: true }).click();
      await expect.poll(async () => Math.abs((await position()) - (await expectedCenter("Contrast")))).toBeLessThan(2);
      await page.screenshot({ path: `test-results/theme-picker-mobile-${reducedMotion}.png`, animations: "disabled" });
   });
}

test("theme swatches stay independent of the active palette and expose their motions", async ({ page }) => {
   await page.emulateMedia({ reducedMotion: "reduce" });
   await page.goto("/");
   await page.getByRole("button", { name: "Open settings" }).click();

   for (const [mode, themes] of Object.entries(THEMES_BY_MODE)) {
      await page.getByRole("radio", { name: mode === "dark" ? "Dark" : "Light", exact: true }).click();
      const swatches = page.locator(".theme-picker__swatch");
      const readColors = () =>
         swatches.evaluateAll((elements) =>
            elements.map((element) => {
               const style = getComputedStyle(element);
               return [style.backgroundColor, style.color];
            })
         );
      const initialColors = await readColors();
      // Check the whole cascade synchronously, without waiting for 18 native repaints.
      // The contrast test separately clicks every theme through the picker.
      const palettes = await swatches.evaluateAll((elements, themes) => {
         const root = document.documentElement;
         const selected = root.dataset["theme"];
         const palettes = themes.map((theme) => {
            root.dataset["theme"] = theme.id;
            return elements.map((element) => {
               const style = getComputedStyle(element);
               return [style.backgroundColor, style.color];
            });
         });
         root.dataset["theme"] = selected;
         return palettes;
      }, themes);
      for (const colors of palettes) expect(colors).toEqual(initialColors);

      const motions = await page
         .locator(".theme-picker__option")
         .evaluateAll((elements) => elements.map((element) => getComputedStyle(element).getPropertyValue("--theme-icon-animation")));
      for (const [index, theme] of themes.entries()) {
         expect(motions[index]).toContain(`theme-icon-${theme.motion}`);
      }

      const selectedTheme = themes[1];
      await page.getByRole("button", { name: selectedTheme.label, exact: true }).click();
      await expect(page.locator("html")).toHaveAttribute("data-theme", selectedTheme.id);
      expect(await readColors()).toEqual(initialColors);
   }
});

test("derived theme colors follow their source and the default palette survives a round trip", async ({ page }) => {
   await page.goto("/");
   const result = await page.evaluate(() => {
      const root = document.documentElement;
      const color = (name: string) => getComputedStyle(root).getPropertyValue(name);
      const original = color("--class-surface-raised");
      root.dataset["theme"] = "frost";
      const border = color("--class-border");
      root.style.setProperty("--accent", "hsl(120 100% 50%)");
      const changedBorder = color("--class-border");
      root.style.removeProperty("--accent");
      const restoredBorder = color("--class-border");
      root.removeAttribute("data-theme");
      const fallback = color("--class-surface-raised");
      root.dataset["theme"] = "dark";
      return { original, border, changedBorder, restoredBorder, fallback, restored: color("--class-surface-raised") };
   });
   expect(result.changedBorder).not.toEqual(result.border);
   expect(result.restoredBorder).toEqual(result.border);
   expect(result.fallback).toEqual(result.original);
   expect(result.restored).toEqual(result.original);
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
