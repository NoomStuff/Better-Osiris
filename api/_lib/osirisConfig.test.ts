import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { getCookieSecret, getDefaultOsirisToken, getOsirisRosterUrl, getRosterTimeZone, normalizeBearerToken } from "./osirisConfig.js";

const originalRosterUrl = process.env["OSIRIS_ROSTER_URL"];
const originalRosterTimeZone = process.env["ROSTER_TIME_ZONE"];

afterEach(() => {
   if (originalRosterUrl === undefined) {
      delete process.env["OSIRIS_ROSTER_URL"];
   } else {
      process.env["OSIRIS_ROSTER_URL"] = originalRosterUrl;
   }
   if (originalRosterTimeZone === undefined) {
      delete process.env["ROSTER_TIME_ZONE"];
   } else {
      process.env["ROSTER_TIME_ZONE"] = originalRosterTimeZone;
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

   void it("rejects plaintext roster endpoints", () => {
      process.env["OSIRIS_ROSTER_URL"] = "http://example.test/roster";
      assert.throws(() => getOsirisRosterUrl(), /must use HTTPS/);
   });

   void it("rejects whitespace inside bearer credentials", () => {
      assert.throws(() => normalizeBearerToken("Bearer first second"), /without whitespace/);
      assert.throws(() => normalizeBearerToken("Bearer\nsecond"), /without whitespace/);
   });

   void it("requires a strong cookie secret", () => {
      process.env["COOKIE_SECRET"] = "short";
      assert.throws(() => getCookieSecret(), /at least 32 characters/);
      process.env["COOKIE_SECRET"] = "replace-with-at-least-32-cryptographically-random-characters";
      assert.throws(() => getCookieSecret(), /unique random value/);
      process.env["COOKIE_SECRET"] = "a-unique-cookie-secret-with-more-than-32-characters";
      assert.equal(getCookieSecret(), process.env["COOKIE_SECRET"]);
      delete process.env["COOKIE_SECRET"];
   });

   void it("falls back to the Amsterdam roster time zone", () => {
      delete process.env["ROSTER_TIME_ZONE"];

      assert.equal(getRosterTimeZone(), "Europe/Amsterdam");
   });

   void it("canonicalizes a configured roster time zone", () => {
      process.env["ROSTER_TIME_ZONE"] = "asia/tokyo";

      assert.equal(getRosterTimeZone(), "Asia/Tokyo");
   });

   void it("rejects an unknown roster time zone", () => {
      process.env["ROSTER_TIME_ZONE"] = "Mars/Olympus_Mons";

      assert.throws(() => getRosterTimeZone(), /valid IANA time zone/);
   });

   void it("requires an explicit production acknowledgement for a shared token", () => {
      const originalNodeEnv = process.env["NODE_ENV"];
      process.env["NODE_ENV"] = "production";
      process.env["BEARER_TOKEN"] = "Bearer shared-token";
      delete process.env["ALLOW_SHARED_BEARER_TOKEN"];
      assert.throws(() => getDefaultOsirisToken(), /ALLOW_SHARED_BEARER_TOKEN=true/);
      process.env["ALLOW_SHARED_BEARER_TOKEN"] = "true";
      assert.equal(getDefaultOsirisToken(), "Bearer shared-token");
      if (originalNodeEnv === undefined) delete process.env["NODE_ENV"];
      else process.env["NODE_ENV"] = originalNodeEnv;
      delete process.env["BEARER_TOKEN"];
      delete process.env["ALLOW_SHARED_BEARER_TOKEN"];
   });
});
