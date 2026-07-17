import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseRosterWeeksRange } from "./rosterWeeksService.js";

void describe("roster weeks service", () => {
   void it("uses the same bounded OSIRIS range for every HTTP adapter", () => {
      assert.deepEqual(parseRosterWeeksRange(null, null), { offset: 0, limit: 5 });
      assert.deepEqual(parseRosterWeeksRange("50", "5"), { offset: 50, limit: 1 });
      assert.throws(() => parseRosterWeeksRange("-1", "5"), /outside the supported range/);
      assert.throws(() => parseRosterWeeksRange("1garbage", "1"), /outside the supported range/);
   });
});
