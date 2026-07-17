import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import type { IncomingMessage } from "node:http";
import { ApiError } from "./errors.js";
import { clearRateLimitEntries, enforceRateLimit } from "./rateLimit.js";

const originalTrustProxy = process.env["TRUST_PROXY"];
const originalVercel = process.env["VERCEL"];
const originalVercelEnvironment = process.env["VERCEL_ENV"];

beforeEach(() => {
   clearRateLimitEntries();
   delete process.env["TRUST_PROXY"];
   delete process.env["VERCEL"];
   delete process.env["VERCEL_ENV"];
});

afterEach(() => {
   clearRateLimitEntries();
   restoreEnvironmentValue("TRUST_PROXY", originalTrustProxy);
   restoreEnvironmentValue("VERCEL", originalVercel);
   restoreEnvironmentValue("VERCEL_ENV", originalVercelEnvironment);
});

void describe("rate limiting client identity", () => {
   void it("ignores spoofed forwarded addresses in standalone deployments", () => {
      enforceRateLimit(createRequest("127.0.0.1", "198.51.100.1"), "test", 1, 60_000);

      assert.throws(
         () => enforceRateLimit(createRequest("127.0.0.1", "198.51.100.2"), "test", 1, 60_000),
         (error: unknown) => error instanceof ApiError && error.status === 429
      );
   });

   void it("uses the proxy end of the forwarded chain when proxy trust is explicit", () => {
      process.env["TRUST_PROXY"] = "true";
      enforceRateLimit(createRequest("127.0.0.1", "spoofed-one, 198.51.100.7"), "test", 1, 60_000);

      assert.throws(
         () => enforceRateLimit(createRequest("127.0.0.1", "spoofed-two, 198.51.100.7"), "test", 1, 60_000),
         (error: unknown) => error instanceof ApiError && error.status === 429
      );
   });
});

function createRequest(remoteAddress: string, forwardedFor: string): IncomingMessage {
   return {
      headers: { "x-forwarded-for": forwardedFor },
      socket: { remoteAddress },
   } as unknown as IncomingMessage;
}

function restoreEnvironmentValue(key: string, value: string | undefined) {
   if (value === undefined) {
      Reflect.deleteProperty(process.env, key);
   } else {
      process.env[key] = value;
   }
}
