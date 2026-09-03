import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { HOLD_REPEAT_INITIAL_DELAY_MS, HOLD_REPEAT_INTERVAL_MS } from "./useKeyboardShortcuts.js";

void describe("keyboard shortcut hold repeat", () => {
   void it("waits half a second, then repeats every 150 ms", () => {
      assert.equal(HOLD_REPEAT_INITIAL_DELAY_MS, 500);
      assert.equal(HOLD_REPEAT_INTERVAL_MS, 150);
   });
});
