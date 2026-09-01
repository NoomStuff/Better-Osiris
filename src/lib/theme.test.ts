import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { DEFAULT_THEME, getStoredTheme, getThemeMode, isThemeId, THEMES_BY_MODE, type ThemeId, type ThemeMode } from "./theme.js";

/* Equivalent themes: the same look at a different time of day. They must share their
   position and icon across the dark and light lists so they line up on a mode switch.
   The mode primaries (dark/light) lead their lists but are excluded from icon sharing. */
const EQUIVALENT_THEMES: readonly (readonly [ThemeId, ThemeId])[] = [
   ["frost", "thaw"],
   ["espresso", "latte"],
   ["moss", "ivy"],
   ["dusk", "dawn"],
   ["ember", "flare"],
];

const UNPAIRED_THEMES = {
   dark: ["abyss", "noir", "contrast"],
   light: ["bloom", "paper", "osiris"],
} as const satisfies Record<ThemeMode, readonly ThemeId[]>;

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

   void it("offers equally many dark and light themes", () => {
      assert.equal(THEMES_BY_MODE.dark.length, THEMES_BY_MODE.light.length);
   });

   void it("lines equivalent themes up across modes", () => {
      const { dark, light } = THEMES_BY_MODE;

      for (const [darkId, lightId] of EQUIVALENT_THEMES) {
         const darkTheme = dark.find((theme) => theme.id === darkId);
         const lightTheme = light.find((theme) => theme.id === lightId);
         assert.ok(darkTheme, `${darkId} should be a dark theme`);
         assert.ok(lightTheme, `${lightId} should be a light theme`);
         assert.equal(dark.indexOf(darkTheme), light.indexOf(lightTheme), `${darkId} and ${lightId} should share their picker position`);
         assert.equal(darkTheme.icon, lightTheme.icon, `${darkId} and ${lightId} should share their icon`);
      }
   });

   void it("puts themes without an equivalent at the end of their mode", () => {
      const { dark, light } = THEMES_BY_MODE;
      const firstUnpairedIndex = EQUIVALENT_THEMES.length + 1;
      assert.deepEqual(
         dark.slice(firstUnpairedIndex).map((theme) => theme.id),
         UNPAIRED_THEMES.dark
      );
      assert.deepEqual(
         light.slice(firstUnpairedIndex).map((theme) => theme.id),
         UNPAIRED_THEMES.light
      );
   });

   void it("leads both mode lists with the primary", () => {
      assert.equal(THEMES_BY_MODE.dark[0].id, "dark");
      assert.equal(THEMES_BY_MODE.light[0].id, "light");
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
