import compression from "compression";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { clearTokenSettingsRoute, getRosterWeeksRoute, getTokenSettingsRoute, saveTokenSettingsRoute, type ApiRouteResponse } from "./api/_lib/apiRoutes.js";
import { ApiError, toApiError, toApiErrorPayload } from "./api/_lib/errors.js";
import { isProduction, validateServerConfiguration } from "./api/_lib/osirisConfig.js";
import { enforceRateLimit } from "./api/_lib/rateLimit.js";
import { applyPrivateResponseHeaders, assertSameOrigin, CONTENT_SECURITY_POLICY } from "./api/_lib/security.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const port = Number(process.env.PORT) || 8787;

validateServerConfiguration();
app.disable("x-powered-by");
app.use(compression());
app.use((req, res, next) => {
   res.setHeader("Content-Security-Policy", CONTENT_SECURITY_POLICY);
   res.setHeader("X-Content-Type-Options", "nosniff");
   res.setHeader("Referrer-Policy", "no-referrer");
   res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
   if (isProduction()) {
      res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
   }
   if (req.path.startsWith("/api/")) {
      applyPrivateResponseHeaders(res);
   }
   next();
});
app.use("/api", express.json({ limit: "8kb", strict: true }));

app.get("/api/roster/weeks", async (req, res) => {
   enforceRateLimit(req, "roster", 120, 60_000);
   const requestUrl = new URL(req.originalUrl, "http://localhost");
   sendRouteResponse(
      res,
      await getRosterWeeksRoute({
         offset: requestUrl.searchParams.get("offset"),
         limit: requestUrl.searchParams.get("limit"),
         cookieHeader: req.headers.cookie,
      })
   );
});
app.all("/api/roster/weeks", (_req, res) => sendMethodNotAllowed(res, ["GET"]));

app.get("/api/settings/osiris-token", (req, res) => {
   sendRouteResponse(res, getTokenSettingsRoute(req.headers.cookie));
});

app.put("/api/settings/osiris-token", (req, res) => {
   assertTokenMutationAllowed(req);
   sendRouteResponse(res, saveTokenSettingsRoute(req.body as unknown));
});

app.delete("/api/settings/osiris-token", (req, res) => {
   assertTokenMutationAllowed(req);
   sendRouteResponse(res, clearTokenSettingsRoute());
});
app.all("/api/settings/osiris-token", (_req, res) => sendMethodNotAllowed(res, ["GET", "PUT", "DELETE"]));

app.use("/api", (_req, res) => {
   const error = new ApiError("API route not found.", { code: "INVALID_REQUEST", status: 404 });
   res.status(error.status).json(toApiErrorPayload(error));
});

const distPath = path.join(__dirname, "dist");

app.use(
   express.static(distPath, {
      etag: true,
      setHeaders: (res, assetPath) => {
         if (path.basename(assetPath) === "index.html") {
            res.setHeader("Cache-Control", "no-cache");
         } else if (assetPath.includes(`${path.sep}assets${path.sep}`)) {
            res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
         }
      },
   })
);

app.use((req, res, next) => {
   if (req.path.startsWith("/api/")) {
      next();
      return;
   }

   if (req.method !== "GET" && req.method !== "HEAD") {
      res.sendStatus(404);
      return;
   }

   res.setHeader("Cache-Control", "no-cache");
   res.sendFile(path.join(distPath, "index.html"), (error: Error | null) => {
      if (error) {
         next(error);
      }
   });
});

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
   const expressError = error as { status?: unknown; type?: unknown };
   const isBodyError = expressError.status === 400 || expressError.status === 413 || expressError.type === "entity.too.large";
   const apiError = isBodyError
      ? new ApiError(expressError.status === 413 ? "The request body is too large." : "The request body must be valid JSON.", {
           code: expressError.status === 413 ? "PAYLOAD_TOO_LARGE" : "INVALID_REQUEST",
           status: expressError.status === 413 ? 413 : 400,
           cause: error,
        })
      : toApiError(error);
   res.status(apiError.status).json(toApiErrorPayload(apiError));
});

app.listen(port, () => {
   console.log(`Roster API listening on http://localhost:${port}`);
});

function sendRouteResponse(res: express.Response, response: ApiRouteResponse) {
   Object.entries(response.headers ?? {}).forEach(([name, value]) => res.setHeader(name, value));
   res.status(response.statusCode).json(response.payload);
}

function sendMethodNotAllowed(res: express.Response, allowedMethods: readonly string[]) {
   const error = new ApiError("Method not allowed.", { code: "INVALID_REQUEST", status: 405 });
   res.setHeader("Allow", allowedMethods.join(", "));
   res.status(error.status).json(toApiErrorPayload(error));
}

function assertTokenMutationAllowed(req: express.Request) {
   assertSameOrigin(req);
   enforceRateLimit(req, "token-mutation", 20, 15 * 60_000);
}
