import type { IncomingMessage, ServerResponse } from "node:http";
import { getRequestUrl, sendJson, sendMethodNotAllowed } from "../_lib/http.js";
import { getRosterErrorMessage, getRosterErrorStatus, loadRosterWeeks } from "../_lib/rosterWeeksService.js";

export default async function handler(req: IncomingMessage, res: ServerResponse) {
   if (req.method !== "GET") {
      sendMethodNotAllowed(res, ["GET"]);
      return;
   }

   const url = getRequestUrl(req);

   try {
      const payload = await loadRosterWeeks({
         offset: url.searchParams.get("offset"),
         limit: url.searchParams.get("limit"),
         cookieHeader: req.headers.cookie,
      });
      sendJson(res, 200, payload);
   } catch (error) {
      sendJson(res, getRosterErrorStatus(error), { error: getRosterErrorMessage(error) });
   }
}
