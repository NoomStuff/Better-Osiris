import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildOsirisTokenCookieHeader } from "./auth.js";
import { createEncryptedOsirisTokenCookieValue, hasOsirisTokenCookie, readOsirisTokenFromCookie } from "./osirisTokenCookie.js";

void describe("OSIRIS token cookie", () => {
   void it("round-trips an encrypted bearer token with the same secret", () => {
      const secret = "token-cookie-secret";
      const token = "Bearer abc.def.ghi";
      const encryptedValue = createEncryptedOsirisTokenCookieValue(token, secret);
      const cookieHeader = buildOsirisTokenCookieHeader(encryptedValue, true);

      assert.equal(hasOsirisTokenCookie(cookieHeader), true);
      assert.equal(readOsirisTokenFromCookie(cookieHeader, secret), token);
      assert.equal(readOsirisTokenFromCookie(cookieHeader, "wrong-secret"), null);
   });
});
