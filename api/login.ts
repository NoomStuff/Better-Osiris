import type { IncomingMessage, ServerResponse } from "node:http";
import { buildAuthCookieHeader, createSignedAuthCookieValue } from "../server/auth.js";
import { getEnvValue } from "../server/env.js";

interface LoginPayload {
   password?: string;
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
   if (req.method !== "POST") {
      res.statusCode = 405;
      res.setHeader("Allow", "POST");
      res.end("Method Not Allowed");
      return;
   }

   const appPassword = getEnvValue("APP_PASSWORD");
   const cookieSecret = getEnvValue("COOKIE_SECRET");

   if (!appPassword || !cookieSecret) {
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "Server auth is not configured." }));
      return;
   }

   const bodyText = await readBody(req);
   const payload = parseLoginPayload(bodyText);

   if (!payload.password) {
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "Password is required." }));
      return;
   }

   if (payload.password !== appPassword) {
      res.statusCode = 401;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "Invalid password." }));
      return;
   }

   const authValue = createSignedAuthCookieValue(cookieSecret);
   const cookieHeader = buildAuthCookieHeader(authValue, process.env.NODE_ENV === "production");

   res.statusCode = 200;
   res.setHeader("Set-Cookie", cookieHeader);
   res.setHeader("Content-Type", "application/json");
   res.end(JSON.stringify({ ok: true }));
}

async function readBody(req: IncomingMessage): Promise<string> {
   return new Promise((resolve, reject) => {
      let data = "";

      req.on("data", (chunk: Buffer | string) => {
         if (typeof chunk === "string") {
            data += chunk;
            return;
         }

         data += chunk.toString("utf8");
      });

      req.on("end", () => {
         resolve(data);
      });

      req.on("error", (error: Error) => {
         reject(error);
      });
   });
}

function parseLoginPayload(bodyText: string): LoginPayload {
   if (!bodyText) {
      return {};
   }

   try {
      const parsed: unknown = JSON.parse(bodyText);

      if (!parsed || typeof parsed !== "object") {
         return {};
      }

      const password = (parsed as { password?: unknown }).password;
      return typeof password === "string" ? { password } : {};
   } catch {
      return {};
   }
}
