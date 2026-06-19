import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildAuthCookieHeader, createSignedAuthCookieValue, isValidAuthCookieValue, parseCookie } from "./auth.js";

void describe("auth cookies", () => {
   void it("creates signed auth cookies that validate with the same secret", () => {
      const secret = "test-cookie-secret";
      const cookieValue = createSignedAuthCookieValue(secret);

      assert.equal(isValidAuthCookieValue(cookieValue, secret), true);
      assert.equal(isValidAuthCookieValue(cookieValue, "different-secret"), false);
   });

   void it("serializes and parses encoded cookie values", () => {
      const cookieValue = "value.with.signature";
      const header = buildAuthCookieHeader(cookieValue, true);

      assert.equal(parseCookie(header, "auth"), encodeURIComponent(cookieValue));
      assert.match(header, /HttpOnly/);
      assert.match(header, /Secure/);
      assert.match(header, /SameSite=lax/);
   });
});
