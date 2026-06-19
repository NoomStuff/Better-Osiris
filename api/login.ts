import type { IncomingMessage, ServerResponse } from "node:http";
import { buildAuthCookieHeader, createSignedAuthCookieValue } from "./_lib/auth.js";
import { getEnvValue } from "./_lib/env.js";
import { readJsonBody, sendJson, sendMethodNotAllowed } from "./_lib/http.js";

interface LoginPayload {
   password?: string;
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
   if (req.method !== "POST") {
      sendMethodNotAllowed(res, ["POST"]);
      return;
   }

   const appPassword = getEnvValue("APP_PASSWORD");
   const cookieSecret = getEnvValue("COOKIE_SECRET");

   if (!appPassword || !cookieSecret) {
      sendJson(res, 500, { error: "Server auth is not configured." });
      return;
   }

   const payload = await readJsonBody<LoginPayload>(req);
   const password = typeof payload?.password === "string" ? payload.password : "";

   if (!password) {
      sendJson(res, 400, { error: "Password is required." });
      return;
   }

   if (password !== appPassword) {
      sendJson(res, 401, { error: "Invalid password." });
      return;
   }

   const authValue = createSignedAuthCookieValue(cookieSecret);
   const cookieHeader = buildAuthCookieHeader(authValue, process.env["NODE_ENV"] === "production");

   sendJson(res, 200, { ok: true }, { headers: { "Set-Cookie": cookieHeader } });
}
