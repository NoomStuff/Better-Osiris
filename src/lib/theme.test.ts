import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_THEME, getStoredTheme, isThemeId, THEMES } from "./theme.js";

void describe("isThemeId", () => {
   void it("accepts every registered theme id", () => {
      for (const theme of THEMES) {
         assert.equal(isThemeId(theme.id), true);
      }
   });

   void it("rejects unknown themes", () => {
      assert.equal(isThemeId("neon"), false);
      assert.equal(isThemeId(""), false);
      assert.equal(isThemeId(null), false);
   });
});

void describe("THEMES", () => {
   void it("has unique ids", () => {
      assert.equal(new Set(THEMES.map((theme) => theme.id)).size, THEMES.length);
   });
});

void describe("getStoredTheme", () => {
   void it("falls back to the default without usable storage", () => {
      assert.equal(getStoredTheme(), DEFAULT_THEME);
   });
});
