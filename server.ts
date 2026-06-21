import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildClearOsirisTokenCookieHeader, buildOsirisTokenCookieHeader } from "./api/_lib/auth.js";
import { getEnvValue } from "./api/_lib/env.js";
import { fetchOsirisRosterWeeks } from "./api/_lib/osirisClient.js";
import { createEncryptedOsirisTokenCookieValue, hasOsirisTokenCookie, readOsirisTokenFromCookie } from "./api/_lib/osirisTokenCookie.js";
import { normalizeRosterWeeksResponse } from "./api/_lib/osirisRosterNormalizer.js";
import { MAX_WEEK_LIMIT, MAX_WEEK_OFFSET, MIN_WEEK_OFFSET } from "./shared/rosterTime.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const port = Number(process.env.PORT) || 8787;

app.use(express.json());

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
   const tokenOverride = getOsirisTokenOverride(req.headers.cookie);

   try {
      const rawResponse = await fetchOsirisRosterWeeks(offset, safeLimit, tokenOverride);
      res.json({
         weeks: normalizeRosterWeeksResponse(rawResponse, offset),
         offset,
         limit: safeLimit,
         hasMore: rawResponse.hasMore && offset + safeLimit - 1 < MAX_WEEK_OFFSET,
      });
   } catch (error) {
      console.error("OSIRIS roster fetch failed:", error);
      const message = error instanceof Error ? error.message : "Unknown roster fetch error.";
      res.status(getRosterErrorStatus(message)).json({ error: message });
   }
});

app.get("/api/settings/osiris-token", (req, res) => {
   const { settings, cookieHeader } = getOsirisTokenSettings(req.headers.cookie);
   if (cookieHeader) {
      res.setHeader("Set-Cookie", cookieHeader);
   }

   res.json(settings);
});

app.put("/api/settings/osiris-token", (req, res) => {
   const cookieSecret = getEnvValue("COOKIE_SECRET");
   if (!cookieSecret) {
      res.status(500).json({ error: "Server auth is not configured." });
      return;
   }

   const token = getTokenFromBody(req.body as unknown);
   if (!token) {
      res.status(400).json({ error: "Token is required." });
      return;
   }

   const encryptedToken = createEncryptedOsirisTokenCookieValue(token, cookieSecret);
   res.setHeader("Set-Cookie", buildOsirisTokenCookieHeader(encryptedToken, process.env.NODE_ENV === "production"));
   res.json({ hasCustomToken: true, hasBearerToken: true });
});

app.delete("/api/settings/osiris-token", (_req, res) => {
   const defaultTokenCookie = createDefaultTokenCookieHeader();
   res.setHeader("Set-Cookie", defaultTokenCookie ?? buildClearOsirisTokenCookieHeader(process.env.NODE_ENV === "production"));
   res.json(defaultTokenCookie ? { hasCustomToken: true, hasBearerToken: true } : { hasCustomToken: false, hasBearerToken: false });
});

const distPath = path.join(__dirname, "dist");

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

function getTokenFromBody(body: unknown): string {
   if (!body || typeof body !== "object") {
      return "";
   }

   const token = (body as { token?: unknown }).token;
   return typeof token === "string" ? token.trim() : "";
}

function getOsirisTokenOverride(cookieHeader: string | undefined): string | null {
   const cookieSecret = getEnvValue("COOKIE_SECRET");
   return cookieSecret ? readOsirisTokenFromCookie(cookieHeader, cookieSecret) : null;
}

function getOsirisTokenSettings(cookieHeader: string | undefined) {
   const hasCustomToken = hasValidOsirisTokenOverride(cookieHeader);

   if (hasCustomToken) {
      return {
         settings: { hasCustomToken: true, hasBearerToken: true },
         cookieHeader: null,
      };
   }

   const defaultTokenCookie = createDefaultTokenCookieHeader();
   if (defaultTokenCookie) {
      return {
         settings: { hasCustomToken: true, hasBearerToken: true },
         cookieHeader: defaultTokenCookie,
      };
   }

   return {
      settings: { hasCustomToken: false, hasBearerToken: false },
      cookieHeader: null,
   };
}

function createDefaultTokenCookieHeader(): string | null {
   const cookieSecret = getEnvValue("COOKIE_SECRET");
   const defaultToken = getEnvValue("BEARER_TOKEN")?.trim();

   if (!cookieSecret || !defaultToken) {
      return null;
   }

   return buildOsirisTokenCookieHeader(createEncryptedOsirisTokenCookieValue(defaultToken, cookieSecret), process.env.NODE_ENV === "production");
}

function hasValidOsirisTokenOverride(cookieHeader: string | undefined): boolean {
   if (!hasOsirisTokenCookie(cookieHeader)) {
      return false;
   }

   return Boolean(getOsirisTokenOverride(cookieHeader));
}

function getRosterErrorStatus(message: string) {
   return message.startsWith("Bearer token is missing.") ? 401 : 502;
}
