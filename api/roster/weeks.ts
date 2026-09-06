import { observeApiRequest } from "../_lib/observability.js";
import type { IncomingMessage, ServerResponse } from "node:http";
import { getRequestUrl, sendJson, sendMethodNotAllowed } from "../_lib/http.js";
import { getRosterWeeksRoute } from "../_lib/apiRoutes.js";
import { enforceRosterRateLimit } from "../_lib/rateLimit.js";
import { toApiError, toApiErrorPayload, errorHeaders } from "../_lib/errors.js";

export default async function handler(req: IncomingMessage, res: ServerResponse) {
   observeApiRequest(req, res, "/api/roster/weeks");
   if (req.method !== "GET") {
      sendMethodNotAllowed(res, ["GET"]);
      return;
   }

   try {
      const url = getRequestUrl(req);
      enforceRosterRateLimit(req);
      const response = await getRosterWeeksRoute({
         offset: url.searchParams.get("offset"),
         limit: url.searchParams.get("limit"),
         cookieHeader: req.headers.cookie,
      });
      sendJson(res, response.statusCode, response.payload, response.headers ? { headers: response.headers } : undefined);
   } catch (error) {
      const apiError = toApiError(error, "The roster request could not be completed.");
      sendJson(res, apiError.status, toApiErrorPayload(apiError), { headers: errorHeaders(apiError) });
   }
}
