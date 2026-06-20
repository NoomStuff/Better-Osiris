import type { IncomingMessage, ServerResponse } from "node:http";
import { requireAuth } from "../_lib/apiAuth.js";
import { sendJson, sendMethodNotAllowed } from "../_lib/http.js";

export default function handler(req: IncomingMessage, res: ServerResponse) {
   if (req.method !== "GET") {
      sendMethodNotAllowed(res, ["GET"]);
      return;
   }

   const auth = requireAuth(req, res);
   if (!auth) {
      return;
   }

   sendJson(res, 200, { ok: true }, { headers: { "Set-Cookie": auth.authCookieHeader } });
}
