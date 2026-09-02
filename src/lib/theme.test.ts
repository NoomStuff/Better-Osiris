import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { DEFAULT_THEME, getStoredTheme, getThemeMode, isThemeId, THEMES_BY_MODE } from "./theme.js";

const ALL_THEMES = [...THEMES_BY_MODE.dark, ...THEMES_BY_MODE.light];

class MemoryStorage {
   private readonly items = new Map<string, string>();

   getItem(key: string) {
      return this.items.get(key) ?? null;
   }

   setItem(key: string, value: string) {
      this.items.set(key, value);
   }

   removeItem(key: string) {
      this.items.delete(key);
   }
}

function installStorage(items: Record<string, string> = {}, prefersLight = false) {
   const localStorage = new MemoryStorage();
   for (const [key, value] of Object.entries(items)) {
      localStorage.setItem(key, value);
   }
   (globalThis as { window?: unknown }).window = {
      localStorage,
      sessionStorage: new MemoryStorage(),
      matchMedia: () => ({ matches: prefersLight }),
   };
   return localStorage;
}

afterEach(() => {
   delete (globalThis as { window?: unknown }).window;
});

void describe("isThemeId", () => {
   void it("accepts every registered theme id", () => {
      for (const theme of ALL_THEMES) {
         assert.equal(isThemeId(theme.id), true);
      }
   });

   void it("rejects unknown themes", () => {
      assert.equal(isThemeId("garbage"), false);
      assert.equal(isThemeId(""), false);
      assert.equal(isThemeId(null), false);
   });
});

void describe("THEMES_BY_MODE", () => {
   void it("has unique ids", () => {
      assert.equal(new Set(ALL_THEMES.map((theme) => theme.id)).size, ALL_THEMES.length);
   });
});

void describe("getThemeMode", () => {
   void it("reports the registered mode of each theme", () => {
      for (const mode of ["dark", "light"] as const) {
         for (const theme of THEMES_BY_MODE[mode]) {
            assert.equal(getThemeMode(theme.id), mode);
         }
      }
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

   void it("keeps themes whose id did not change", () => {
      installStorage({ "roster-theme": "frost" });
      assert.equal(getStoredTheme(), "frost");
   });
});
