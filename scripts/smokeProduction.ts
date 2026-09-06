import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import path from "node:path";
import { parseOsirisTokenSettings, parseWeekBatch } from "../shared/rosterValidation";

const probe = createServer();
await new Promise<void>((resolve) => probe.listen(0, "127.0.0.1", resolve));
const address = probe.address();
assert.ok(address && typeof address !== "string");
const port = address.port;
await new Promise<void>((resolve, reject) => probe.close((error) => (error ? reject(error) : resolve())));
const base = `http://127.0.0.1:${port}`;
const token = "Bearer synthetic-smoke-token";
const child = spawn(process.execPath, ["--preload", path.resolve("tests/support/smokeUpstream.ts"), "server.ts"], {
   cwd: process.cwd(),
   windowsHide: true,
   env: {
      ...process.env,
      NODE_ENV: "production",
      PORT: String(port),
      COOKIE_SECRET: "smoke-only-secret-at-least-thirty-two-characters",
      BEARER_TOKEN: "",
      OSIRIS_ROSTER_URL: "https://smoke.osiris.test/roster",
      ROSTER_TIME_ZONE: "Europe/Amsterdam",
   },
   stdio: ["ignore", "pipe", "pipe"],
});
let logs = "";
child.stdout.on("data", (chunk: Buffer) => {
   logs += chunk.toString();
});
child.stderr.on("data", (chunk: Buffer) => {
   logs += chunk.toString();
});
try {
   let ready = false;
   for (let attempt = 0; attempt < 100 && !ready; attempt += 1) {
      try {
         ready = (await fetch(base + "/api/roster/config")).ok;
      } catch {
         /* Process is starting. */
      }
      if (!ready) await new Promise((resolve) => setTimeout(resolve, 100));
   }
   assert.ok(ready, "Production server did not start");
   const shell = await fetch(base);
   assert.equal(shell.status, 200);
   assert.equal(shell.headers.get("cache-control"), "no-cache");
   assert.ok(shell.headers.get("content-security-policy")?.includes("default-src 'self'"));
   assert.equal(shell.headers.get("x-content-type-options"), "nosniff");
   const html = await shell.text();
   const script = /src="(\/assets\/[^"]+\.js)"/.exec(html)?.[1];
   assert.ok(script);
   const asset = await fetch(base + script);
   assert.equal(asset.status, 200);
   assert.match(asset.headers.get("cache-control") ?? "", /immutable/);
   const invalid = await fetch(base + "/api/settings/osiris-token", { method: "PUT", headers: { "Content-Type": "application/json" }, body: "{" });
   assert.equal(invalid.status, 400);
   assert.match(invalid.headers.get("cache-control") ?? "", /private, no-store/);
   assert.ok(invalid.headers.get("x-request-id"));
   const saved = await fetch(base + "/api/settings/osiris-token", {
      method: "PUT",
      headers: { "Content-Type": "application/json", Origin: base },
      body: JSON.stringify({ token }),
   });
   assert.equal(saved.status, 200);
   const settings = parseOsirisTokenSettings(await saved.json());
   assert.ok(settings.contextId);
   const cookie = saved.headers.get("set-cookie");
   assert.ok(cookie);
   assert.match(cookie, /HttpOnly/);
   assert.match(cookie, /Secure/);
   assert.ok(!cookie.includes(token));
   const weeks = await fetch(base + "/api/roster/weeks?offset=0&limit=5", { headers: { Cookie: cookie.split(";")[0] ?? "" } });
   assert.equal(weeks.status, 200);
   assert.equal(weeks.headers.get("vary")?.includes("Cookie"), true);
   const batch = parseWeekBatch(await weeks.json());
   assert.equal(batch.contextId, settings.contextId);
   assert.equal(batch.weeks[0]?.classes[0]?.title, "Smoke class");
   const second = parseWeekBatch(await (await fetch(base + "/api/roster/weeks?offset=0&limit=5", { headers: { Cookie: cookie.split(";")[0] ?? "" } })).json());
   assert.equal(second.fetchedAt, batch.fetchedAt, "A server cache hit must retain the upstream fetch time");
   assert.ok(!logs.includes(token));
   assert.match(logs, /"requestId":"[^"]+".*"status":400.*"durationMs":/);
   console.log("Production smoke passed: static assets, private headers, request IDs, invalid JSON, encrypted cookie, and synthetic OSIRIS round trip.");
} finally {
   child.kill();
   await new Promise<void>((resolve) => (child.exitCode !== null ? resolve() : child.once("exit", () => resolve())));
}
