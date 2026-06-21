import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { afterEach, describe, it } from "node:test";
import { readOsirisTokenFromCookie } from "../_lib/osirisTokenCookie.js";
import handler from "./osiris-token.js";
import type { IncomingMessage, ServerResponse } from "node:http";

interface MockRequestOptions {
   method?: string;
   cookie?: string;
}

class MockResponse {
   statusCode = 200;
   readonly headers = new Map<string, number | string | string[]>();
   body = "";

   setHeader(name: string, value: number | string | string[]) {
      this.headers.set(name.toLowerCase(), value);
      return this;
   }

   end(chunk?: unknown) {
      this.body = typeof chunk === "string" ? chunk : chunk instanceof Buffer ? chunk.toString("utf8") : "";
      return this;
   }
}

afterEach(() => {
   delete process.env["COOKIE_SECRET"];
   delete process.env["BEARER_TOKEN"];
});

void describe("/api/settings/osiris-token", () => {
   void it("seeds the encrypted token cookie from the default bearer token when blank", async () => {
      process.env["COOKIE_SECRET"] = "settings-secret";
      process.env["BEARER_TOKEN"] = "Bearer default-token";

      const response = await callSettingsHandler({ method: "GET" });
      const payload = JSON.parse(response.body) as { hasCustomToken?: boolean; hasBearerToken?: boolean };
      const cookieHeader = response.headers.get("set-cookie");

      assert.equal(response.statusCode, 200);
      assert.equal(payload.hasCustomToken, true);
      assert.equal(payload.hasBearerToken, true);
      assert.equal(readOsirisTokenFromCookie(String(cookieHeader), process.env["COOKIE_SECRET"]), process.env["BEARER_TOKEN"]);
   });

   void it("reports no bearer token when the default bearer token is blank", async () => {
      process.env["COOKIE_SECRET"] = "settings-secret";
      process.env["BEARER_TOKEN"] = "";

      const response = await callSettingsHandler({ method: "GET" });
      const payload = JSON.parse(response.body) as { hasCustomToken?: boolean; hasBearerToken?: boolean };

      assert.equal(response.statusCode, 200);
      assert.equal(payload.hasCustomToken, false);
      assert.equal(payload.hasBearerToken, false);
      assert.equal(response.headers.get("set-cookie"), undefined);
   });
});

async function callSettingsHandler(options: MockRequestOptions) {
   const req = createRequest(options);
   const res = new MockResponse();

   await handler(req, res as unknown as ServerResponse);
   return res;
}

function createRequest({ method = "GET", cookie }: MockRequestOptions): IncomingMessage {
   const req = Readable.from([]);
   const headers: IncomingMessage["headers"] = {
      host: "example.test",
   };

   if (cookie) {
      headers.cookie = cookie;
   }

   return Object.assign(req, {
      method,
      url: "/api/settings/osiris-token",
      headers,
   }) as IncomingMessage;
}
