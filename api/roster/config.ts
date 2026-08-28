import type { IncomingMessage, ServerResponse } from "node:http";
import { getRequestUrl, sendJson, sendMethodNotAllowed } from "../_lib/http.js";
import { getRosterConfigRoute } from "../_lib/apiRoutes.js";
import { enforceRateLimit } from "../_lib/rateLimit.js";
import { toApiError, toApiErrorPayload } from "../_lib/errors.js";

export default function handler(req: IncomingMessage, res: ServerResponse) {
   if (req.method !== "GET") {
      sendMethodNotAllowed(res, ["GET"]);
      return;
   }

   try {
      getRequestUrl(req);
      enforceRateLimit(req, "roster-config", 60, 60_000);
      const response = getRosterConfigRoute();
      sendJson(res, response.statusCode, response.payload, response.headers ? { headers: response.headers } : undefined);
   } catch (error) {
      const apiError = toApiError(error, "The roster configuration request could not be completed.");
      sendJson(res, apiError.status, toApiErrorPayload(apiError));
   }
}
