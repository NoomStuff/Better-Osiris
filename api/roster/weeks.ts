import type { IncomingMessage, ServerResponse } from "node:http";
import { requireAuth } from "../_lib/apiAuth.js";
import { getRequestUrl, parseBoundedInt, sendJson, sendMethodNotAllowed } from "../_lib/http.js";
import { fetchOsirisRosterWeeks } from "../_lib/osirisClient.js";
import { readOsirisTokenFromCookie } from "../_lib/osirisTokenCookie.js";
import { normalizeRosterWeeksResponse } from "../_lib/osirisRosterNormalizer.js";
import { MAX_WEEK_LIMIT, MAX_WEEK_OFFSET, MIN_WEEK_OFFSET } from "../../shared/rosterTime.js";

export default async function handler(req: IncomingMessage, res: ServerResponse) {
   if (req.method !== "GET") {
      sendMethodNotAllowed(res, ["GET"]);
      return;
   }

   const auth = requireAuth(req, res);
   if (!auth) {
      return;
   }

   const url = getRequestUrl(req);
   const offset = parseBoundedInt(url.searchParams.get("offset"), MIN_WEEK_OFFSET, MIN_WEEK_OFFSET, MAX_WEEK_OFFSET);
   const limit = parseBoundedInt(url.searchParams.get("limit"), MAX_WEEK_LIMIT, 1, MAX_WEEK_LIMIT);
   const safeLimit = Math.min(limit, MAX_WEEK_OFFSET - offset + 1);
   const tokenOverride = readOsirisTokenFromCookie(req.headers.cookie, auth.cookieSecret);

   try {
      const rawResponse = await fetchOsirisRosterWeeks(offset, safeLimit, tokenOverride);
      const weeks = normalizeRosterWeeksResponse(rawResponse, offset);
      sendJson(
         res,
         200,
         {
            weeks,
            offset,
            limit: safeLimit,
            hasMore: rawResponse.hasMore && offset + safeLimit - 1 < MAX_WEEK_OFFSET,
         },
         { headers: { "Set-Cookie": auth.authCookieHeader } }
      );
   } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown roster fetch error.";
      sendJson(res, 502, { error: message }, { headers: { "Set-Cookie": auth.authCookieHeader } });
   }
}
