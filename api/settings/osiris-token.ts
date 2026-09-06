import { observeApiRequest } from "../_lib/observability.js";
import type { IncomingMessage, ServerResponse } from "node:http";
import { readJsonBody, sendJson, sendMethodNotAllowed } from "../_lib/http.js";
import { clearTokenSettingsRoute, getTokenSettingsRoute, saveTokenSettingsRoute, type ApiRouteResponse } from "../_lib/apiRoutes.js";
import { toApiError, toApiErrorPayload, errorHeaders } from "../_lib/errors.js";
import { enforceTokenRateLimit } from "../_lib/rateLimit.js";
import { assertSameOrigin } from "../_lib/security.js";

export default async function handler(req: IncomingMessage, res: ServerResponse) {
   observeApiRequest(req, res, "/api/settings/osiris-token");
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
      enforceTokenRateLimit(req);
      const response = req.method === "DELETE" ? clearTokenSettingsRoute() : await saveTokenSettingsRoute(await readJsonBody(req));
      sendRouteResponse(res, response);
   } catch (error) {
      const apiError = toApiError(error, "The token setting request could not be completed.");
      sendJson(res, apiError.status, toApiErrorPayload(apiError), { headers: errorHeaders(apiError) });
   }
}

function sendRouteResponse(res: ServerResponse, response: ApiRouteResponse) {
   sendJson(res, response.statusCode, response.payload, response.headers ? { headers: response.headers } : undefined);
}
