import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { AUTH_COOKIE_NAME, buildAuthCookieHeader, createSignedAuthCookieValue, isValidAuthCookieValue, parseCookie } from "./api/_lib/auth.js";
import { getEnvValue } from "./api/_lib/env.js";
import { fetchOsirisRosterWeeks } from "./api/_lib/osirisClient.js";
import { normalizeRosterWeekResponse, normalizeRosterWeeksResponse } from "./api/_lib/osirisRosterNormalizer.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const port = Number(process.env.PORT) || 8787;
const MIN_WEEK_OFFSET = 0;
const MAX_WEEK_OFFSET = 50;
const MAX_WEEK_LIMIT = 5;
const shouldBypassAuth = process.argv.includes("--dev-auth-bypass");

app.use(express.json());

app.post("/api/login", (req, res) => {
   const appPassword = getEnvValue("APP_PASSWORD");
   const cookieSecret = getEnvValue("COOKIE_SECRET");

   if (!appPassword || !cookieSecret) {
      res.status(500).json({ error: "Server auth is not configured." });
      return;
   }

   const password = getPasswordFromBody(req.body as unknown);

   if (!password) {
      res.status(400).json({ error: "Password is required." });
      return;
   }

   if (password !== appPassword) {
      res.status(401).json({ error: "Invalid password." });
      return;
   }

   const authValue = createSignedAuthCookieValue(cookieSecret);
   const cookieHeader = buildAuthCookieHeader(authValue, process.env.NODE_ENV === "production");

   res.setHeader("Set-Cookie", cookieHeader);
   res.json({ ok: true });
});

app.use("/api", (req, res, next) => {
   if (req.path === "/login") {
      next();
      return;
   }

   if (shouldBypassAuth) {
      next();
      return;
   }

   const cookieSecret = getEnvValue("COOKIE_SECRET");
   if (!cookieSecret) {
      res.status(500).json({ error: "Server auth is not configured." });
      return;
   }

   const authCookie = parseCookie(req.headers.cookie, AUTH_COOKIE_NAME);
   if (!authCookie || !isValidAuthCookieValue(authCookie, cookieSecret)) {
      res.status(401).json({ error: "Unauthorized" });
      return;
   }

   res.setHeader("Set-Cookie", buildAuthCookieHeader(authCookie, process.env.NODE_ENV === "production"));
   next();
});

app.get("/api/roster/week", async (req, res) => {
   const offsetParam = req.query.offset;
   const offsetValue = Array.isArray(offsetParam) ? offsetParam[0] : offsetParam;
   const offsetString = typeof offsetValue === "string" ? offsetValue : "0";
   const rawOffset = Number.parseInt(offsetString, 10);
   const offset = Number.isNaN(rawOffset) ? MIN_WEEK_OFFSET : Math.min(Math.max(rawOffset, MIN_WEEK_OFFSET), MAX_WEEK_OFFSET);

   try {
      const rawResponse = await fetchOsirisRosterWeeks(offset, 1);
      res.json(normalizeRosterWeekResponse(rawResponse, offset));
   } catch (error) {
      console.error("OSIRIS roster fetch failed:", error);
      const message = error instanceof Error ? error.message : "Unknown roster fetch error.";
      res.status(502).json({ error: message });
   }
});

app.get("/api/roster/weeks", async (req, res) => {
   const offsetParam = req.query.offset;
   const limitParam = req.query.limit;
   const offsetValue = Array.isArray(offsetParam) ? offsetParam[0] : offsetParam;
   const limitValue = Array.isArray(limitParam) ? limitParam[0] : limitParam;
   const offsetString = typeof offsetValue === "string" ? offsetValue : "0";
   const limitString = typeof limitValue === "string" ? limitValue : String(MAX_WEEK_LIMIT);
   const rawOffset = Number.parseInt(offsetString, 10);
   const rawLimit = Number.parseInt(limitString, 10);
   const offset = Number.isNaN(rawOffset) ? MIN_WEEK_OFFSET : Math.min(Math.max(rawOffset, MIN_WEEK_OFFSET), MAX_WEEK_OFFSET);
   const limit = Number.isNaN(rawLimit) ? MAX_WEEK_LIMIT : Math.min(Math.max(rawLimit, 1), MAX_WEEK_LIMIT);
   const safeLimit = Math.min(limit, MAX_WEEK_OFFSET - offset + 1);

   try {
      const rawResponse = await fetchOsirisRosterWeeks(offset, safeLimit);
      res.json({
         weeks: normalizeRosterWeeksResponse(rawResponse, offset),
         offset,
         limit: safeLimit,
         hasMore: rawResponse.hasMore && offset + safeLimit - 1 < MAX_WEEK_OFFSET,
      });
   } catch (error) {
      console.error("OSIRIS roster fetch failed:", error);
      const message = error instanceof Error ? error.message : "Unknown roster fetch error.";
      res.status(502).json({ error: message });
   }
});

const distPath = path.join(__dirname, "dist");

app.get("/login", (_req, res) => {
   res.redirect(302, "/login.html");
});

app.use((req, res, next) => {
   if (req.path.startsWith("/api/") || req.path === "/login.html" || req.path.startsWith("/login")) {
      next();
      return;
   }

   if (shouldBypassAuth) {
      next();
      return;
   }

   const cookieSecret = getEnvValue("COOKIE_SECRET");
   const authCookie = parseCookie(req.headers.cookie, AUTH_COOKIE_NAME);

   if (!cookieSecret || !authCookie || !isValidAuthCookieValue(authCookie, cookieSecret)) {
      const nextPath = req.originalUrl && req.originalUrl !== "/" ? `?next=${encodeURIComponent(req.originalUrl)}` : "";
      res.redirect(302, `/login.html${nextPath}`);
      return;
   }

   res.setHeader("Set-Cookie", buildAuthCookieHeader(authCookie, process.env.NODE_ENV === "production"));
   next();
});

app.use(express.static(distPath));

app.use((req, res, next) => {
   if (req.path.startsWith("/api/")) {
      next();
      return;
   }

   res.sendFile(path.join(distPath, "index.html"), (error: Error | null) => {
      if (error) {
         next(error);
      }
   });
});

app.listen(port, () => {
   console.log(`Roster API listening on http://localhost:${port}`);
});

function getPasswordFromBody(body: unknown): string {
   if (!body || typeof body !== "object") {
      return "";
   }

   const password = (body as { password?: unknown }).password;
   return typeof password === "string" ? password : "";
}
