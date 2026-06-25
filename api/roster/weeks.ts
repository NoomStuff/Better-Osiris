import type { IncomingMessage, ServerResponse } from "node:http";
import { getEnvValue } from "../_lib/env.js";
import { getRequestUrl, parseBoundedInt, sendJson, sendMethodNotAllowed } from "../_lib/http.js";
import { fetchOsirisRosterWeeks } from "../_lib/osirisClient.js";
import { getDefaultOsirisToken } from "../_lib/osirisToken.js";
import { readOsirisTokenFromCookie } from "../_lib/osirisTokenCookie.js";
import { normalizeRosterWeeksResponse } from "../_lib/osirisRosterNormalizer.js";
import { MAX_WEEK_LIMIT, MAX_WEEK_OFFSET } from "../../shared/rosterTime.js";

const MIN_OSIRIS_WEEK_OFFSET = 0;

export default async function handler(req: IncomingMessage, res: ServerResponse) {
   if (req.method !== "GET") {
      sendMethodNotAllowed(res, ["GET"]);
      return;
   }

   const url = getRequestUrl(req);
   const offset = parseBoundedInt(url.searchParams.get("offset"), MIN_OSIRIS_WEEK_OFFSET, MIN_OSIRIS_WEEK_OFFSET, MAX_WEEK_OFFSET);
   const limit = parseBoundedInt(url.searchParams.get("limit"), MAX_WEEK_LIMIT, 1, MAX_WEEK_LIMIT);
   const safeLimit = Math.min(limit, MAX_WEEK_OFFSET - offset + 1);
   const cookieSecret = getEnvValue("COOKIE_SECRET");
   const tokenOverride = cookieSecret ? readOsirisTokenFromCookie(req.headers.cookie, cookieSecret) : null;
   const bearerToken = tokenOverride ?? getDefaultOsirisToken();

   try {
      const rawResponse = await fetchOsirisRosterWeeks(offset, safeLimit, bearerToken);
      const weeks = normalizeRosterWeeksResponse(rawResponse, offset);
      sendJson(res, 200, {
         weeks,
         offset,
         limit: safeLimit,
         hasMore: rawResponse.hasMore && offset + safeLimit - 1 < MAX_WEEK_OFFSET,
      });
   } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown roster fetch error.";
      sendJson(res, getRosterErrorStatus(message), { error: message });
   }
}

function getRosterErrorStatus(message: string) {
   return message.startsWith("Bearer token is missing.") ? 401 : 502;
}
