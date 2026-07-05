import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getAdjacentBatchStarts, getBatchOffsets, getBatchStart } from "./rosterWeekPolicy";

void describe("roster week batch policy", () => {
   void it("maps future weeks into stable five-week batches", () => {
      assert.equal(getBatchStart(0), 0);
      assert.equal(getBatchStart(4), 0);
      assert.equal(getBatchStart(5), 5);
      assert.deepEqual(getBatchOffsets(5), [5, 6, 7, 8, 9]);
   });

   void it("keeps the locally cached previous week in its own batch", () => {
      assert.equal(getBatchStart(-1), -1);
      assert.deepEqual(getBatchOffsets(-1), [-1]);
      assert.deepEqual(getAdjacentBatchStarts(-1), [0]);
   });

   void it("clamps the final batch to the navigation limit", () => {
      assert.deepEqual(getBatchOffsets(50), [50]);
   });
});
