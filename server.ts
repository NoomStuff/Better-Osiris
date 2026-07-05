import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { clearOsirisTokenSetting, getOsirisTokenSettings, OsirisTokenSettingsError, saveOsirisTokenSetting } from "./api/_lib/osirisTokenSettingsService.js";
import { getRosterErrorMessage, getRosterErrorStatus, loadRosterWeeks } from "./api/_lib/rosterWeeksService.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const port = Number(process.env.PORT) || 8787;

app.use(express.json());

app.get("/api/roster/weeks", async (req, res) => {
   try {
      const requestUrl = new URL(req.originalUrl, "http://localhost");
      res.json(
         await loadRosterWeeks({
            offset: requestUrl.searchParams.get("offset"),
            limit: requestUrl.searchParams.get("limit"),
            cookieHeader: req.headers.cookie,
         })
      );
   } catch (error) {
      console.error("OSIRIS roster fetch failed:", error);
      res.status(getRosterErrorStatus(error)).json({ error: getRosterErrorMessage(error) });
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
   try {
      const result = saveOsirisTokenSetting(getTokenFromBody(req.body as unknown));
      setCookieHeader(res, result.cookieHeader);
      res.json(result.settings);
   } catch (error) {
      const status = error instanceof OsirisTokenSettingsError ? error.status : 500;
      const message = error instanceof Error ? error.message : "Failed to save bearer token.";
      res.status(status).json({ error: message });
   }
});

app.delete("/api/settings/osiris-token", (_req, res) => {
   const result = clearOsirisTokenSetting();
   setCookieHeader(res, result.cookieHeader);
   res.json(result.settings);
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

function setCookieHeader(res: express.Response, cookieHeader: string | null) {
   if (cookieHeader) {
      res.setHeader("Set-Cookie", cookieHeader);
   }
}
