import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createSignedAuthCookieValue } from "./api/_lib/auth.js";
import { middleware } from "./middleware.js";

void describe("Vercel middleware auth", () => {
   void it("accepts auth cookies produced by the Node auth helper", async () => {
      const previousSecret = process.env["COOKIE_SECRET"];
      process.env["COOKIE_SECRET"] = "middleware-secret";

      try {
         const cookieValue = createSignedAuthCookieValue(process.env["COOKIE_SECRET"]);
         const response = await middleware(
            new Request("https://example.test/app", {
               headers: {
                  cookie: `auth=${cookieValue}`,
               },
            })
         );

         assert.equal(response, undefined);
      } finally {
         if (previousSecret === undefined) {
            delete process.env["COOKIE_SECRET"];
         } else {
            process.env["COOKIE_SECRET"] = previousSecret;
         }
      }
   });

   void it("redirects unauthenticated app requests to login with next path", async () => {
      const previousSecret = process.env["COOKIE_SECRET"];
      process.env["COOKIE_SECRET"] = "middleware-secret";

      try {
         const response = await middleware(new Request("https://example.test/week?offset=2"));

         assert.ok(response);
         assert.equal(response.status, 302);
         assert.equal(response.headers.get("location"), "https://example.test/login.html?next=%2Fweek%3Foffset%3D2");
      } finally {
         if (previousSecret === undefined) {
            delete process.env["COOKIE_SECRET"];
         } else {
            process.env["COOKIE_SECRET"] = previousSecret;
         }
      }
   });
});
