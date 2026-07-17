import type { IncomingMessage, ServerResponse } from "node:http";
import { readJsonBody, sendJson, sendMethodNotAllowed } from "../_lib/http.js";
import { clearTokenSettingsRoute, getTokenSettingsRoute, saveTokenSettingsRoute, type ApiRouteResponse } from "../_lib/apiRoutes.js";
import { toApiError, toApiErrorPayload } from "../_lib/errors.js";
import { enforceRateLimit } from "../_lib/rateLimit.js";
import { assertSameOrigin } from "../_lib/security.js";

export default async function handler(req: IncomingMessage, res: ServerResponse) {
   if (req.method !== "GET" && req.method !== "PUT" && req.method !== "DELETE") {
      sendMethodNotAllowed(res, ["GET", "PUT", "DELETE"]);
      return;
   }

   if (req.method === "GET") {
      sendRouteResponse(res, getTokenSettingsRoute(req.headers.cookie));
      return;
   }

   try {
      assertSameOrigin(req);
      enforceRateLimit(req, "token-mutation", 20, 15 * 60_000);
      const response = req.method === "DELETE" ? clearTokenSettingsRoute() : saveTokenSettingsRoute(await readJsonBody(req));
      sendRouteResponse(res, response);
   } catch (error) {
      const apiError = toApiError(error, "The token setting request could not be completed.");
      sendJson(res, apiError.status, toApiErrorPayload(apiError));
   }
}

function sendRouteResponse(res: ServerResponse, response: ApiRouteResponse) {
   sendJson(res, response.statusCode, response.payload, response.headers ? { headers: response.headers } : undefined);
}
