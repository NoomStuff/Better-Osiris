import type { IncomingMessage, ServerResponse } from "node:http";
import { readJsonBody, sendJson, sendMethodNotAllowed } from "../_lib/http.js";
import { clearOsirisTokenSetting, getOsirisTokenSettings, OsirisTokenSettingsError, saveOsirisTokenSetting } from "../_lib/osirisTokenSettingsService.js";

export default async function handler(req: IncomingMessage, res: ServerResponse) {
   if (req.method !== "GET" && req.method !== "PUT" && req.method !== "DELETE") {
      sendMethodNotAllowed(res, ["GET", "PUT", "DELETE"]);
      return;
   }

   if (req.method === "GET") {
      const { settings, cookieHeader } = getOsirisTokenSettings(req.headers.cookie);
      sendJson(res, 200, settings, cookieHeader ? { headers: { "Set-Cookie": cookieHeader } } : undefined);
      return;
   }

   if (req.method === "DELETE") {
      const result = clearOsirisTokenSetting();
      sendJson(res, 200, result.settings, result.cookieHeader ? { headers: { "Set-Cookie": result.cookieHeader } } : undefined);
      return;
   }

   const payload = await readJsonBody<{ token?: unknown }>(req);
   try {
      const result = saveOsirisTokenSetting(payload?.token);
      sendJson(res, 200, result.settings, result.cookieHeader ? { headers: { "Set-Cookie": result.cookieHeader } } : undefined);
   } catch (error) {
      const status = error instanceof OsirisTokenSettingsError ? error.status : 500;
      const message = error instanceof Error ? error.message : "Failed to save bearer token.";
      sendJson(res, status, { error: message });
   }
}
