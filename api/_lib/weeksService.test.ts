import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseWeeksRange } from "./weeksService.js";

void describe("roster weeks service", () => {
   void it("uses the same bounded OSIRIS range for every HTTP adapter", () => {
      assert.deepEqual(parseWeeksRange(null, null), { offset: 0, limit: 5 });
      assert.deepEqual(parseWeeksRange("50", "5"), { offset: 50, limit: 1 });
      assert.throws(() => parseWeeksRange("-1", "5"), /outside the supported range/);
      assert.throws(() => parseWeeksRange("1garbage", "1"), /outside the supported range/);
   });
});
