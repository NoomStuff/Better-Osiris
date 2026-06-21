import type { IncomingMessage, ServerResponse } from "node:http";
import { buildClearOsirisTokenCookieHeader, buildOsirisTokenCookieHeader } from "../_lib/auth.js";
import { getEnvValue } from "../_lib/env.js";
import { readJsonBody, sendJson, sendMethodNotAllowed } from "../_lib/http.js";
import { createEncryptedOsirisTokenCookieValue, hasOsirisTokenCookie, readOsirisTokenFromCookie } from "../_lib/osirisTokenCookie.js";

export default async function handler(req: IncomingMessage, res: ServerResponse) {
   if (req.method !== "GET" && req.method !== "PUT" && req.method !== "DELETE") {
      sendMethodNotAllowed(res, ["GET", "PUT", "DELETE"]);
      return;
   }

   if (req.method === "GET") {
      const { settings, cookieHeader } = getOsirisTokenSettings(req.headers.cookie);
      sendJson(res, 200, settings, cookieHeader ? { headers: { "Set-Cookie": cookieHeader } } : undefined);
      return;
   }

   if (req.method === "DELETE") {
      const defaultTokenCookie = createDefaultTokenCookieHeader();
      const settings = defaultTokenCookie ? { hasCustomToken: true, hasBearerToken: true } : { hasCustomToken: false, hasBearerToken: false };
      sendJson(res, 200, settings, { headers: { "Set-Cookie": defaultTokenCookie ?? buildClearOsirisTokenCookieHeader(isProduction()) } });
      return;
   }

   const cookieSecret = getEnvValue("COOKIE_SECRET");
   if (!cookieSecret) {
      sendJson(res, 500, { error: "COOKIE_SECRET is required before a browser bearer token can be saved." });
      return;
   }

   const payload = await readJsonBody<{ token?: unknown }>(req);
   const token = typeof payload?.token === "string" ? payload.token.trim() : "";
   if (!token) {
      sendJson(res, 400, { error: "Token is required." });
      return;
   }

   const encryptedToken = createEncryptedOsirisTokenCookieValue(token, cookieSecret);
   sendJson(
      res,
      200,
      { hasCustomToken: true, hasBearerToken: true },
      { headers: { "Set-Cookie": buildOsirisTokenCookieHeader(encryptedToken, isProduction()) } }
   );
}

function getOsirisTokenSettings(cookieHeader: string | undefined) {
   const cookieSecret = getEnvValue("COOKIE_SECRET");
   const hasCustomToken = cookieSecret ? hasValidOsirisTokenOverride(cookieHeader, cookieSecret) : false;

   if (hasCustomToken) {
      return {
         settings: { hasCustomToken: true, hasBearerToken: true },
         cookieHeader: null,
      };
   }

   const defaultTokenCookie = createDefaultTokenCookieHeader();
   if (defaultTokenCookie) {
      return {
         settings: { hasCustomToken: true, hasBearerToken: true },
         cookieHeader: defaultTokenCookie,
      };
   }

   return {
      settings: { hasCustomToken: false, hasBearerToken: false },
      cookieHeader: null,
   };
}

function createDefaultTokenCookieHeader(): string | null {
   const cookieSecret = getEnvValue("COOKIE_SECRET");
   const defaultToken = getEnvValue("BEARER_TOKEN")?.trim();

   if (!cookieSecret || !defaultToken) {
      return null;
   }

   return buildOsirisTokenCookieHeader(createEncryptedOsirisTokenCookieValue(defaultToken, cookieSecret), isProduction());
}

function hasValidOsirisTokenOverride(cookieHeader: string | undefined, secret: string): boolean {
   if (!hasOsirisTokenCookie(cookieHeader)) {
      return false;
   }

   return Boolean(readOsirisTokenFromCookie(cookieHeader, secret));
}

function isProduction() {
   return process.env["NODE_ENV"] === "production";
}
