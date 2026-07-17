import type { IncomingMessage, ServerResponse } from "node:http";
import { getRequestUrl, sendJson, sendMethodNotAllowed } from "../_lib/http.js";
import { getRosterWeeksRoute } from "../_lib/apiRoutes.js";
import { enforceRateLimit } from "../_lib/rateLimit.js";
import { toApiError, toApiErrorPayload } from "../_lib/errors.js";

export default async function handler(req: IncomingMessage, res: ServerResponse) {
   if (req.method !== "GET") {
      sendMethodNotAllowed(res, ["GET"]);
      return;
   }

   try {
      const url = getRequestUrl(req);
      enforceRateLimit(req, "roster", 120, 60_000);
      const response = await getRosterWeeksRoute({
         offset: url.searchParams.get("offset"),
         limit: url.searchParams.get("limit"),
         cookieHeader: req.headers.cookie,
      });
      sendJson(res, response.statusCode, response.payload, response.headers ? { headers: response.headers } : undefined);
   } catch (error) {
      const apiError = toApiError(error, "The roster request could not be completed.");
      sendJson(res, apiError.status, toApiErrorPayload(apiError));
   }
}
