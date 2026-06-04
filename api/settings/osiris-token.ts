import type { IncomingMessage, ServerResponse } from "node:http";
import {
   AUTH_COOKIE_NAME,
   buildAuthCookieHeader,
   buildClearOsirisTokenCookieHeader,
   buildOsirisTokenCookieHeader,
   isValidAuthCookieValue,
   parseCookie,
} from "../_lib/auth.js";
import { getEnvValue } from "../_lib/env.js";
import { createEncryptedOsirisTokenCookieValue, hasOsirisTokenCookie, readOsirisTokenFromCookie } from "../_lib/osirisTokenCookie.js";

export default async function handler(req: IncomingMessage, res: ServerResponse) {
   if (req.method !== "GET" && req.method !== "PUT" && req.method !== "DELETE") {
      res.statusCode = 405;
      res.setHeader("Allow", "GET, PUT, DELETE");
      res.end("Method Not Allowed");
      return;
   }

   const cookieSecret = getEnvValue("COOKIE_SECRET");
   if (!cookieSecret) {
      sendJson(res, 500, { error: "Server auth is not configured." });
      return;
   }

   const authCookie = parseCookie(req.headers.cookie, AUTH_COOKIE_NAME);
   if (!authCookie || !isValidAuthCookieValue(authCookie, cookieSecret)) {
      sendJson(res, 401, { error: "Unauthorized" });
      return;
   }

   const isProduction = process.env["NODE_ENV"] === "production";
   const authCookieHeader = buildAuthCookieHeader(authCookie, isProduction);

   if (req.method === "GET") {
      res.setHeader("Set-Cookie", authCookieHeader);
      sendJson(res, 200, { hasCustomToken: hasValidOsirisTokenOverride(req.headers.cookie, cookieSecret) });
      return;
   }

   if (req.method === "DELETE") {
      res.setHeader("Set-Cookie", [authCookieHeader, buildClearOsirisTokenCookieHeader(isProduction)]);
      sendJson(res, 200, { hasCustomToken: false });
      return;
   }

   const token = await readTokenFromRequest(req);
   if (!token) {
      sendJson(res, 400, { error: "Token is required." });
      return;
   }

   const encryptedToken = createEncryptedOsirisTokenCookieValue(token, cookieSecret);
   res.setHeader("Set-Cookie", [authCookieHeader, buildOsirisTokenCookieHeader(encryptedToken, isProduction)]);
   sendJson(res, 200, { hasCustomToken: true });
}

function hasValidOsirisTokenOverride(cookieHeader: string | undefined, secret: string): boolean {
   if (!hasOsirisTokenCookie(cookieHeader)) {
      return false;
   }

   return Boolean(readOsirisTokenFromCookie(cookieHeader, secret));
}

async function readTokenFromRequest(req: IncomingMessage): Promise<string> {
   const chunks: Uint8Array[] = [];

   for await (const chunk of req) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
   }

   try {
      const payload = JSON.parse(Buffer.concat(chunks).toString("utf8")) as { token?: unknown };
      return typeof payload.token === "string" ? payload.token.trim() : "";
   } catch {
      return "";
   }
}

function sendJson(res: ServerResponse, statusCode: number, payload: unknown) {
   res.statusCode = statusCode;
   res.setHeader("Content-Type", "application/json");
   res.end(JSON.stringify(payload));
}
