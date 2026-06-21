import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildClearOsirisTokenCookieHeader, buildOsirisTokenCookieHeader, parseCookie } from "./auth.js";

void describe("cookie helpers", () => {
   void it("serializes and parses encoded OSIRIS token cookie values", () => {
      const cookieValue = "value.with.signature";
      const header = buildOsirisTokenCookieHeader(cookieValue, true);

      assert.equal(parseCookie(header, "osiris_bearer"), encodeURIComponent(cookieValue));
      assert.match(header, /HttpOnly/);
      assert.match(header, /Secure/);
      assert.match(header, /SameSite=lax/);
   });

   void it("serializes a clearing OSIRIS token cookie", () => {
      const header = buildClearOsirisTokenCookieHeader(false);

      assert.equal(parseCookie(header, "osiris_bearer"), "");
      assert.match(header, /Max-Age=1/);
      assert.doesNotMatch(header, /Secure/);
   });
});
