import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readJsonResponse, tryReadJson } from "./fetch.js";

void describe("API response parsing", () => {
   void it("describes empty API responses as server availability failures", async () => {
      await assert.rejects(readJsonResponse(new Response("", { status: 502 }), "Settings API"), /API server may be unavailable/);
   });

   void it("describes malformed API responses without leaking JSON parser errors", async () => {
      await assert.rejects(readJsonResponse(new Response("not-json", { status: 502 }), "Settings API"), /returned invalid JSON \(HTTP 502\)/);
   });

   void it("parses JSON bodies leniently for error handling", async () => {
      assert.deepEqual(await tryReadJson(new Response('{"error":"failed"}')), { error: "failed" });
   });

   void it("returns null for empty or malformed bodies instead of throwing", async () => {
      assert.equal(await tryReadJson(new Response("")), null);
      assert.equal(await tryReadJson(new Response("   ")), null);
      assert.equal(await tryReadJson(new Response("<html>gateway error</html>")), null);
   });
});
