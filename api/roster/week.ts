import type { IncomingMessage, ServerResponse } from "node:http";
import { AUTH_COOKIE_NAME, buildAuthCookieHeader, isValidAuthCookieValue, parseCookie } from "../_lib/auth.js";
import { getEnvValue } from "../_lib/env.js";
import { fetchOsirisRosterWeeks } from "../_lib/osirisClient.js";
import { readOsirisTokenFromCookie } from "../_lib/osirisTokenCookie.js";
import { normalizeRosterWeekResponse } from "../_lib/osirisRosterNormalizer.js";

const MIN_WEEK_OFFSET = 0;
const MAX_WEEK_OFFSET = 50;

export default async function handler(req: IncomingMessage, res: ServerResponse) {
   if (req.method !== "GET") {
      res.statusCode = 405;
      res.setHeader("Allow", "GET");
      res.end("Method Not Allowed");
      return;
   }

   const cookieSecret = getEnvValue("COOKIE_SECRET");
   if (!cookieSecret) {
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "Server auth is not configured." }));
      return;
   }

   const authCookie = parseCookie(req.headers.cookie, AUTH_COOKIE_NAME);
   if (!authCookie || !isValidAuthCookieValue(authCookie, cookieSecret)) {
      res.statusCode = 401;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "Unauthorized" }));
      return;
   }

   res.setHeader("Set-Cookie", buildAuthCookieHeader(authCookie, process.env["NODE_ENV"] === "production"));

   const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
   const offsetString = url.searchParams.get("offset") ?? "0";
   const rawOffset = Number.parseInt(offsetString, 10);
   const offset = Number.isNaN(rawOffset) ? MIN_WEEK_OFFSET : Math.min(Math.max(rawOffset, MIN_WEEK_OFFSET), MAX_WEEK_OFFSET);
   const tokenOverride = readOsirisTokenFromCookie(req.headers.cookie, cookieSecret);

   try {
      const rawResponse = await fetchOsirisRosterWeeks(offset, 1, tokenOverride);
      const payload = normalizeRosterWeekResponse(rawResponse, offset);
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(payload));
   } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown roster fetch error.";
      res.statusCode = 502;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: message }));
   }
}
