import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { RosterRequestError } from "./roster.js";

void describe("roster request errors", () => {
   void it("treats 401 and 403 statuses as auth related", () => {
      assert.equal(new RosterRequestError("failed", 401, "", true).isAuthRelated, true);
      assert.equal(new RosterRequestError("failed", 403, "", true).isAuthRelated, true);
   });

   void it("treats an AUTH_REQUIRED error code as auth related regardless of status", () => {
      const error = new RosterRequestError("failed", 500, "Bearer token is missing.", false, "AUTH_REQUIRED");

      assert.equal(error.isAuthRelated, true);
   });

   void it("treats other failures as unrelated to auth", () => {
      assert.equal(new RosterRequestError("failed", 502, "OSIRIS could not be reached.", true).isAuthRelated, false);
      assert.equal(new RosterRequestError("failed", 500, "contains the word unauthorized in prose", true).isAuthRelated, false);
   });
});
