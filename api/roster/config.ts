import { observeApiRequest } from "../_lib/observability.js";
import type { IncomingMessage, ServerResponse } from "node:http";
import { getRequestUrl, sendJson, sendMethodNotAllowed } from "../_lib/http.js";
import { getRosterConfigRoute } from "../_lib/apiRoutes.js";
import { enforceRateLimit } from "../_lib/rateLimit.js";
import { toApiError, toApiErrorPayload } from "../_lib/errors.js";

export default function handler(req: IncomingMessage, res: ServerResponse) {
   observeApiRequest(req, res, "/api/roster/config");
   if (req.method !== "GET") {
      sendMethodNotAllowed(res, ["GET"]);
      return;
   }

   try {
      getRequestUrl(req);
      enforceRateLimit(req, "roster-config", 3000, 60_000);
      const response = getRosterConfigRoute();
      sendJson(res, response.statusCode, response.payload, response.headers ? { headers: response.headers } : undefined);
   } catch (error) {
      const apiError = toApiError(error, "The roster configuration request could not be completed.");
      sendJson(res, apiError.status, toApiErrorPayload(apiError));
   }
}
