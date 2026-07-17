import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { loadEnvironmentFiles } from "./env.js";

void describe("environment file loading", () => {
   void it("prefers production-specific values over generic local values", async () => {
      const directory = await fs.mkdtemp(path.join(os.tmpdir(), "better-osiris-env-"));

      try {
         await Promise.all([
            fs.writeFile(path.join(directory, ".env.local"), "SETTING=generic-local\n"),
            fs.writeFile(path.join(directory, ".env.production"), "SETTING=production\n"),
         ]);

         assert.equal(loadEnvironmentFiles(directory, "production").get("SETTING"), "production");
      } finally {
         await fs.rm(directory, { recursive: true, force: true });
      }
   });
});
