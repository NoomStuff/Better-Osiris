import type { IncomingMessage, ServerResponse } from "node:http";
import { AUTH_COOKIE_NAME, buildAuthCookieHeader, isValidAuthCookieValue, parseCookie } from "./auth.js";
import { getEnvValue } from "./env.js";
import { sendJson } from "./http.js";

export interface AuthContext {
   cookieSecret: string;
   authCookie: string;
   authCookieHeader: string;
   isProduction: boolean;
}

export function requireAuth(req: IncomingMessage, res: ServerResponse): AuthContext | null {
   const cookieSecret = getEnvValue("COOKIE_SECRET");
   if (!cookieSecret) {
      sendJson(res, 500, { error: "Server auth is not configured." });
      return null;
   }

   const authCookie = parseCookie(req.headers.cookie, AUTH_COOKIE_NAME);
   if (!authCookie || !isValidAuthCookieValue(authCookie, cookieSecret)) {
      sendJson(res, 401, { error: "Unauthorized" });
      return null;
   }

   const isProduction = process.env["NODE_ENV"] === "production";
   return {
      cookieSecret,
      authCookie,
      authCookieHeader: buildAuthCookieHeader(authCookie, isProduction),
      isProduction,
   };
}
