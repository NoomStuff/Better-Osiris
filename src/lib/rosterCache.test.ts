import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { clearRosterBrowserCache, CURRENT_WEEK_CACHE_KEY, SESSION_LESSON_DIFFS_KEY } from "./rosterCache.js";

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

void describe("roster browser cache", () => {
   afterEach(() => {
      delete (globalThis as { window?: unknown }).window;
   });

   void it("removes persisted roster data and session diff cache", () => {
      const localStorage = new MemoryStorage();
      const sessionStorage = new MemoryStorage();
      localStorage.setItem(CURRENT_WEEK_CACHE_KEY, "cached-week");
      sessionStorage.setItem(SESSION_LESSON_DIFFS_KEY, "cached-diffs");

      (globalThis as { window?: unknown }).window = { localStorage, sessionStorage };

      clearRosterBrowserCache();

      assert.equal(localStorage.getItem(CURRENT_WEEK_CACHE_KEY), null);
      assert.equal(sessionStorage.getItem(SESSION_LESSON_DIFFS_KEY), null);
   });
});
