import type { IncomingMessage, ServerResponse } from "node:http";
import { buildClearOsirisTokenCookieHeader, buildOsirisTokenCookieHeader } from "../_lib/auth.js";
import { requireAuth } from "../_lib/apiAuth.js";
import { readJsonBody, sendJson, sendMethodNotAllowed } from "../_lib/http.js";
import { createEncryptedOsirisTokenCookieValue, hasOsirisTokenCookie, readOsirisTokenFromCookie } from "../_lib/osirisTokenCookie.js";

export default async function handler(req: IncomingMessage, res: ServerResponse) {
   if (req.method !== "GET" && req.method !== "PUT" && req.method !== "DELETE") {
      sendMethodNotAllowed(res, ["GET", "PUT", "DELETE"]);
      return;
   }

   const auth = requireAuth(req, res);
   if (!auth) {
      return;
   }

   if (req.method === "GET") {
      sendJson(
         res,
         200,
         { hasCustomToken: hasValidOsirisTokenOverride(req.headers.cookie, auth.cookieSecret) },
         { headers: { "Set-Cookie": auth.authCookieHeader } }
      );
      return;
   }

   if (req.method === "DELETE") {
      sendJson(
         res,
         200,
         { hasCustomToken: false },
         { headers: { "Set-Cookie": [auth.authCookieHeader, buildClearOsirisTokenCookieHeader(auth.isProduction)] } }
      );
      return;
   }

   const payload = await readJsonBody<{ token?: unknown }>(req);
   const token = typeof payload?.token === "string" ? payload.token.trim() : "";
   if (!token) {
      sendJson(res, 400, { error: "Token is required." });
      return;
   }

   const encryptedToken = createEncryptedOsirisTokenCookieValue(token, auth.cookieSecret);
   sendJson(
      res,
      200,
      { hasCustomToken: true },
      { headers: { "Set-Cookie": [auth.authCookieHeader, buildOsirisTokenCookieHeader(encryptedToken, auth.isProduction)] } }
   );
}

function hasValidOsirisTokenOverride(cookieHeader: string | undefined, secret: string): boolean {
   if (!hasOsirisTokenCookie(cookieHeader)) {
      return false;
   }

   return Boolean(readOsirisTokenFromCookie(cookieHeader, secret));
}
