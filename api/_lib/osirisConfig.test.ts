import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { getOsirisRosterUrl } from "./osirisConfig.js";

const originalRosterUrl = process.env["OSIRIS_ROSTER_URL"];

afterEach(() => {
   if (originalRosterUrl === undefined) {
      delete process.env["OSIRIS_ROSTER_URL"];
   } else {
      process.env["OSIRIS_ROSTER_URL"] = originalRosterUrl;
   }
});

void describe("OSIRIS configuration", () => {
   void it("uses the explicitly configured roster endpoint", () => {
      process.env["OSIRIS_ROSTER_URL"] = "https://example.test/custom/roster";

      assert.equal(getOsirisRosterUrl(), "https://example.test/custom/roster");
   });

   void it("requires an explicit endpoint", () => {
      process.env["OSIRIS_ROSTER_URL"] = "";

      assert.throws(() => getOsirisRosterUrl(), /OSIRIS_ROSTER_URL is required/);
   });
});
