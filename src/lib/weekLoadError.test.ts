import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { WeekRequestError } from "../api/weeks";
import { toWeekLoadError } from "./weekLoadError";

void describe("week load error mapping", () => {
   void it("marks an upstream rejection after a successful load as an expired saved token", () => {
      const error = new WeekRequestError("Roster request failed with HTTP 401: rejected.", 401, "rejected.", false, "UPSTREAM_AUTH_FAILED");
      const loadError = toWeekLoadError(error, { hadSuccessfulLoad: true });
      assert.equal(loadError.isAuthRelated, true);
      assert.equal(loadError.savedTokenExpired, true);
   });

   void it("treats the same rejection without a prior success as a mistyped token", () => {
      const error = new WeekRequestError("Roster request failed with HTTP 401: rejected.", 401, "rejected.", false, "UPSTREAM_AUTH_FAILED");
      assert.equal(toWeekLoadError(error).savedTokenExpired, false);
      assert.equal(toWeekLoadError(error, { hadSuccessfulLoad: false }).savedTokenExpired, false);
   });

   void it("never marks other auth failures as expired", () => {
      const authRequired = new WeekRequestError("Roster request failed with HTTP 401: required.", 401, "required.", false, "AUTH_REQUIRED");
      assert.equal(toWeekLoadError(authRequired, { hadSuccessfulLoad: true }).savedTokenExpired, false);
      assert.ok(!toWeekLoadError(new Error("boom"), { hadSuccessfulLoad: true }).savedTokenExpired);
   });
});
