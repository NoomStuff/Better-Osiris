import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { ensureDevelopmentCookieSecret } from "./devEnvironment.js";
import { isSecureCookieSecret } from "./osirisConfig.js";

void describe("development environment setup", () => {
   void it("replaces the public example secret without exposing the generated value", async () => {
      await withTemporaryEnvironment(
         'COOKIE_SECRET="replace-with-at-least-32-cryptographically-random-characters"\nBEARER_TOKEN="Bearer test"\n',
         async (envPath) => {
            assert.equal(await ensureDevelopmentCookieSecret(envPath), true);
            const contents = await fs.readFile(envPath, "utf8");
            const secret = /^COOKIE_SECRET="([^"]+)"$/m.exec(contents)?.[1];

            assert.equal(isSecureCookieSecret(secret), true);
            assert.match(contents, /BEARER_TOKEN="Bearer test"/);
         }
      );
   });

   void it("leaves an existing secure secret unchanged", async () => {
      const original = 'COOKIE_SECRET="a-unique-development-secret-with-more-than-32-characters"\n';
      await withTemporaryEnvironment(original, async (envPath) => {
         assert.equal(await ensureDevelopmentCookieSecret(envPath), false);
         assert.equal(await fs.readFile(envPath, "utf8"), original);
      });
   });
});

async function withTemporaryEnvironment(contents: string, run: (envPath: string) => Promise<void>) {
   const directory = await fs.mkdtemp(path.join(os.tmpdir(), "better-osiris-dev-env-"));
   const envPath = path.join(directory, ".env");
   try {
      await fs.writeFile(envPath, contents);
      await run(envPath);
   } finally {
      await fs.rm(directory, { recursive: true, force: true });
   }
}
