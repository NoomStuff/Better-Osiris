import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { HOLD_REPEAT_INITIAL_DELAY_MS, HOLD_REPEAT_INTERVAL_MS } from "./useKeyboardShortcuts.js";

void describe("keyboard shortcut hold repeat", () => {
   void it("waits one second, then repeats every 200 ms", () => {
      assert.equal(HOLD_REPEAT_INITIAL_DELAY_MS, 1_000);
      assert.equal(HOLD_REPEAT_INTERVAL_MS, 200);
   });
});
