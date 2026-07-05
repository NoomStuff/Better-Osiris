import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getRosterErrorStatus, parseRosterWeeksRange } from "./rosterWeeksService.js";

void describe("roster weeks service", () => {
   void it("uses the same bounded OSIRIS range for every HTTP adapter", () => {
      assert.deepEqual(parseRosterWeeksRange("-1", "99"), { offset: 0, limit: 5 });
      assert.deepEqual(parseRosterWeeksRange("50", "5"), { offset: 50, limit: 1 });
      assert.deepEqual(parseRosterWeeksRange("invalid", "invalid"), { offset: 0, limit: 5 });
   });

   void it("preserves upstream authentication statuses", () => {
      assert.equal(getRosterErrorStatus(new Error("Bearer token is missing. Set one first.")), 401);
      assert.equal(getRosterErrorStatus(new Error("OSIRIS request failed with 401.")), 401);
      assert.equal(getRosterErrorStatus(new Error("OSIRIS request failed with 403.")), 403);
      assert.equal(getRosterErrorStatus(new Error("OSIRIS request failed with 500.")), 502);
   });
});
