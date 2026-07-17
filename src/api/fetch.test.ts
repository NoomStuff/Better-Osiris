import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readJsonResponse } from "./fetch.js";

void describe("API response parsing", () => {
   void it("describes empty API responses as server availability failures", async () => {
      await assert.rejects(readJsonResponse(new Response("", { status: 502 }), "Settings API"), /API server may be unavailable/);
   });

   void it("describes malformed API responses without leaking JSON parser errors", async () => {
      await assert.rejects(readJsonResponse(new Response("not-json", { status: 502 }), "Settings API"), /returned invalid JSON \(HTTP 502\)/);
   });
});
