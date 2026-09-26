import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { checkSessionAfterAuthError, getSessionSnapshot, refreshSession, saveSessionToken, SESSION_EPOCH_KEY } from "./sessionStore";

const originalFetch = globalThis.fetch;
const pending: ((response: Response) => void)[] = [];

function respond(contextId: string) {
   const resolve = pending.shift();
   assert.ok(resolve, "Expected a settings request");
   resolve(Response.json({ hasBearerToken: true, hasCustomToken: true, contextId }));
}

void describe("session request ordering", () => {
   beforeEach(() => {
      const values = new Map<string, string>();
      const storage = {
         getItem: (key: string) => values.get(key) ?? null,
         setItem: (key: string, value: string) => {
            values.set(key, value);
         },
         removeItem: (key: string) => {
            values.delete(key);
         },
      };
      (globalThis as { window?: unknown }).window = { localStorage: storage, sessionStorage: storage, setTimeout, clearTimeout };
      globalThis.fetch = () => new Promise<Response>((resolve) => pending.push(resolve));
   });
   afterEach(() => {
      globalThis.fetch = originalFetch;
      pending.length = 0;
      delete (globalThis as { window?: unknown }).window;
   });

   void it("ignores a settings read superseded by a newer check", async () => {
      const initial = refreshSession();
      respond("new-account");
      await initial;
      const older = checkSessionAfterAuthError();
      const newer = checkSessionAfterAuthError();
      const oldResponse = pending.shift();
      assert.ok(oldResponse);
      respond("new-account");
      await newer;
      oldResponse(Response.json({ hasBearerToken: true, hasCustomToken: true, contextId: "old-account" }));
      await older;
      assert.equal(getSessionSnapshot().settings?.contextId, "new-account");
   });

   void it("does not publish old settings while a token save is pending", async () => {
      const initial = refreshSession();
      const saving = saveSessionToken("new-token");
      respond("old-account");
      await initial;
      assert.equal(getSessionSnapshot().settings, null);
      assert.equal(getSessionSnapshot().isMutating, true);
      respond("new-account");
      await saving;
      assert.equal(getSessionSnapshot().settings?.contextId, "new-account");
      assert.equal(getSessionSnapshot().isMutating, false);
   });

   void it("ignores an auth check when another tab changed credentials", async () => {
      const initial = refreshSession();
      respond("current-account");
      await initial;
      const checking = checkSessionAfterAuthError();
      window.localStorage.setItem(SESSION_EPOCH_KEY, "another-tab");
      respond("obsolete-account");
      await checking;
      assert.equal(getSessionSnapshot().settings?.contextId, "current-account");
   });

   void it("rejects overlapping cookie mutations before sending a second request", async () => {
      const saving = saveSessionToken("first-token");
      await assert.rejects(saveSessionToken("second-token"), /already in progress/);
      assert.equal(pending.length, 1);
      respond("first-account");
      await saving;
   });
});
