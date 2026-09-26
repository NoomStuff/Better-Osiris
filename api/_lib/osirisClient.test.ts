import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { ApiError } from "./errors.js";
import { clearOsirisRosterCache, fetchOsirisRosterWeeks } from "./osirisClient.js";

const originalFetch = globalThis.fetch;
const originalRosterUrl = process.env["OSIRIS_ROSTER_URL"];

afterEach(() => {
   globalThis.fetch = originalFetch;
   clearOsirisRosterCache();
   if (originalRosterUrl === undefined) {
      delete process.env["OSIRIS_ROSTER_URL"];
   } else {
      process.env["OSIRIS_ROSTER_URL"] = originalRosterUrl;
   }
});

void describe("OSIRIS client", () => {
   void it("does not refill a cleared cache or remove its replacement request", async () => {
      process.env["OSIRIS_ROSTER_URL"] = "https://example.test/roster";
      const pending: ((response: Response) => void)[] = [];
      globalThis.fetch = () => new Promise<Response>((resolve) => pending.push(resolve));
      const response = (week: number) => Response.json({ items: [{ week, startdatum: "2026-06-15", dagen: [] }], offset: 0 });

      const old = fetchOsirisRosterWeeks(0, 1, "Bearer test-token");
      clearOsirisRosterCache();
      const replacement = fetchOsirisRosterWeeks(0, 1, "Bearer test-token");
      pending[0]?.(response(24));
      await old;
      const joined = fetchOsirisRosterWeeks(0, 1, "Bearer test-token");
      assert.equal(pending.length, 2);
      pending[1]?.(response(25));
      const [fresh, concurrent] = await Promise.all([replacement, joined]);
      assert.equal(fresh.items[0]?.week, 25);
      assert.equal(concurrent.items[0]?.week, 25);
      assert.equal((await fetchOsirisRosterWeeks(0, 1, "Bearer test-token")).items[0]?.week, 25);
      assert.equal(pending.length, 2);
   });

   void it("reports a mid-stream disconnect as a retryable upstream failure", async () => {
      process.env["OSIRIS_ROSTER_URL"] = "https://example.test/roster";
      const body = new ReadableStream<Uint8Array>({
         start(controller) {
            controller.enqueue(new TextEncoder().encode('{"items":'));
            controller.error(new Error("socket closed"));
         },
      });
      globalThis.fetch = () =>
         Promise.resolve(
            new Response(body, {
               status: 200,
               headers: { "Content-Type": "application/json" },
            })
         );

      await assert.rejects(fetchOsirisRosterWeeks(0, 1, "Bearer test-token"), (error: unknown) => {
         assert.ok(error instanceof ApiError);
         assert.equal(error.code, "UPSTREAM_REQUEST_FAILED");
         assert.equal(error.status, 502);
         assert.equal(error.retryable, true);
         return true;
      });
   });

   void it("keeps cached weeks when a request arrives without a token", async () => {
      process.env["OSIRIS_ROSTER_URL"] = "https://example.test/roster";
      let upstreamCalls = 0;
      globalThis.fetch = () => {
         upstreamCalls += 1;
         return Promise.resolve(
            new Response(JSON.stringify({ items: [{ week: 25, startdatum: "2026-06-15", dagen: [] }], offset: 0 }), {
               status: 200,
               headers: { "Content-Type": "application/json" },
            })
         );
      };

      await fetchOsirisRosterWeeks(0, 1, "Bearer known-token");
      await assert.rejects(fetchOsirisRosterWeeks(0, 1, null), /Bearer token is missing/);
      // The anonymous request must not evict the cached entry for the known token.
      await fetchOsirisRosterWeeks(0, 1, "Bearer known-token");
      assert.equal(upstreamCalls, 1);
   });
});
