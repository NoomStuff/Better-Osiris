import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { DEFAULT_THEME, getStoredTheme, THEMES_BY_MODE } from "./theme.js";

const ALL_THEMES = [...THEMES_BY_MODE.dark, ...THEMES_BY_MODE.light];

function installStorage(items: Record<string, string> = {}, prefersLight = false) {
   (globalThis as { window?: unknown }).window = {
      localStorage: { getItem: (key: string) => items[key] ?? null },
      matchMedia: () => ({ matches: prefersLight }),
   };
}

afterEach(() => {
   delete (globalThis as { window?: unknown }).window;
});

void describe("THEMES_BY_MODE", () => {
   void it("has unique ids", () => {
      assert.equal(new Set(ALL_THEMES.map((theme) => theme.id)).size, ALL_THEMES.length);
   });
});

void describe("getStoredTheme", () => {
   void it("falls back to the default without usable storage", () => {
      assert.equal(getStoredTheme(), DEFAULT_THEME);
   });

   void it("falls back to the default for an unknown stored id", () => {
      installStorage({ "roster-theme": "neon" });
      assert.equal(getStoredTheme(), DEFAULT_THEME);
   });

   void it("uses the light primary for a fresh light system", () => {
      installStorage({}, true);
      assert.equal(getStoredTheme(), "light");
   });

   void it("uses the dark primary for a fresh dark system", () => {
      installStorage({}, false);
      assert.equal(getStoredTheme(), "dark");
   });

   void it("keeps a saved theme over the system preference", () => {
      installStorage({ "roster-theme": "frost" }, true);
      assert.equal(getStoredTheme(), "frost");
   });
});
