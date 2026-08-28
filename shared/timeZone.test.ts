import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isValidTimeZone, resolveCanonicalTimeZone } from "./timeZone.js";

void describe("time zone utilities", () => {
   void it("accepts IANA time zone names regardless of case", () => {
      assert.equal(isValidTimeZone("Europe/Amsterdam"), true);
      assert.equal(resolveCanonicalTimeZone("europe/amsterdam"), "Europe/Amsterdam");
   });

   void it("rejects unknown or empty zones", () => {
      assert.equal(isValidTimeZone("Mars/Olympus_Mons"), false);
      assert.equal(isValidTimeZone(""), false);
      assert.throws(() => resolveCanonicalTimeZone("Mars/Olympus_Mons"));
   });
});
