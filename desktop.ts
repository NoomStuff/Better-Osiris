import { extname } from "node:path";
import { clearOsirisTokenSetting, getOsirisTokenSettings, OsirisTokenSettingsError, saveOsirisTokenSetting } from "./api/_lib/osirisTokenSettingsService.js";
import { getRosterErrorMessage, getRosterErrorStatus, loadRosterWeeks } from "./api/_lib/rosterWeeksService.js";

const APP_DATA_DIRECTORY = "Better Osiris";
const COOKIE_SECRET_FILE = "cookie-secret";
const DEFAULT_ROSTER_URL = "https://mborijnland.osiris-student.nl/student/osiris/student/rooster/per_week";
const DIST_ROOT = new URL("./dist/", import.meta.url);
const INDEX_FILE = new URL("index.html", DIST_ROOT);

await configureDesktopEnvironment();

export default {
   fetch: handleRequest,
};

async function handleRequest(request: Request): Promise<Response> {
   const url = new URL(request.url);

   if (url.pathname === "/api/roster/weeks" && request.method === "GET") {
      return getRosterWeeks(request, url);
   }

   if (url.pathname === "/api/settings/osiris-token") {
      return handleTokenSettings(request);
   }

   if (url.pathname.startsWith("/api/")) {
      return json({ error: "Not found." }, 404);
   }

   return serveWebAsset(url.pathname);
}

async function getRosterWeeks(request: Request, url: URL): Promise<Response> {
   try {
      return json(
         await loadRosterWeeks({
            offset: url.searchParams.get("offset"),
            limit: url.searchParams.get("limit"),
            cookieHeader: request.headers.get("cookie") ?? undefined,
         })
      );
   } catch (error) {
      console.error("OSIRIS roster fetch failed:", error);
      return json({ error: getRosterErrorMessage(error) }, getRosterErrorStatus(error));
   }
}

async function handleTokenSettings(request: Request): Promise<Response> {
   if (request.method === "GET") {
      const result = getOsirisTokenSettings(request.headers.get("cookie") ?? undefined);
      return json(result.settings, 200, result.cookieHeader);
   }

   if (request.method === "PUT") {
      try {
         const body: unknown = await request.json();
         const result = saveOsirisTokenSetting(getTokenFromBody(body));
         return json(result.settings, 200, result.cookieHeader);
      } catch (error) {
         const status = error instanceof OsirisTokenSettingsError ? error.status : 400;
         const message = error instanceof Error ? error.message : "Failed to save bearer token.";
         return json({ error: message }, status);
      }
   }

   if (request.method === "DELETE") {
      const result = clearOsirisTokenSetting();
      return json(result.settings, 200, result.cookieHeader);
   }

   return json({ error: "Method not allowed." }, 405);
}

async function serveWebAsset(pathname: string): Promise<Response> {
   const relativePath = pathname === "/" ? "index.html" : pathname.slice(1);
   const assetUrl = new URL(relativePath, DIST_ROOT);

   if (assetUrl.href.startsWith(DIST_ROOT.href)) {
      const asset = await readFile(assetUrl);
      if (asset) {
         return new Response(toArrayBuffer(asset), {
            headers: {
               "content-type": contentType(assetUrl.pathname),
               "cache-control": assetUrl.pathname.includes("/assets/") ? "public, max-age=31536000, immutable" : "no-cache",
            },
         });
      }
   }

   const index = await readFile(INDEX_FILE);
   return index
      ? new Response(toArrayBuffer(index), { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache" } })
      : new Response("The desktop UI has not been built. Run `bun run desktop:build`.", { status: 500 });
}

async function readFile(url: URL): Promise<Uint8Array | null> {
   try {
      return await Deno.readFile(url);
   } catch (error) {
      if (error instanceof Deno.errors.NotFound) {
         return null;
      }
      throw error;
   }
}

async function configureDesktopEnvironment() {
   if (!Deno.env.get("OSIRIS_ROSTER_URL")) {
      Deno.env.set("OSIRIS_ROSTER_URL", DEFAULT_ROSTER_URL);
   }

   if (Deno.env.get("COOKIE_SECRET")) {
      return;
   }

   const appDataRoot =
      Deno.env.get("LOCALAPPDATA") ?? Deno.env.get("XDG_CONFIG_HOME") ?? Deno.env.get("APPDATA") ?? Deno.env.get("HOME") ?? Deno.env.get("USERPROFILE");

   if (!appDataRoot) {
      Deno.env.set("COOKIE_SECRET", crypto.randomUUID() + crypto.randomUUID());
      return;
   }

   const directory = `${appDataRoot}/${APP_DATA_DIRECTORY}`;
   const secretPath = `${directory}/${COOKIE_SECRET_FILE}`;
   await Deno.mkdir(directory, { recursive: true });

   try {
      Deno.env.set("COOKIE_SECRET", await Deno.readTextFile(secretPath));
   } catch (error) {
      if (!(error instanceof Deno.errors.NotFound)) {
         throw error;
      }

      const secret = crypto.randomUUID() + crypto.randomUUID();
      await Deno.writeTextFile(secretPath, secret, { createNew: true });
      Deno.env.set("COOKIE_SECRET", secret);
   }
}

function getTokenFromBody(body: unknown): string {
   if (!body || typeof body !== "object") {
      return "";
   }

   const token = (body as { token?: unknown }).token;
   return typeof token === "string" ? token.trim() : "";
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
   return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function json(body: unknown, status = 200, cookieHeader: string | null = null): Response {
   const headers = new Headers({ "content-type": "application/json; charset=utf-8" });
   if (cookieHeader) {
      headers.set("set-cookie", cookieHeader);
   }
   return new Response(JSON.stringify(body), { status, headers });
}

function contentType(pathname: string): string {
   const types: Record<string, string> = {
      ".css": "text/css; charset=utf-8",
      ".html": "text/html; charset=utf-8",
      ".ico": "image/x-icon",
      ".js": "text/javascript; charset=utf-8",
      ".json": "application/json; charset=utf-8",
      ".map": "application/json; charset=utf-8",
      ".png": "image/png",
      ".svg": "image/svg+xml",
      ".woff": "font/woff",
      ".woff2": "font/woff2",
   };

   return types[extname(pathname).toLowerCase()] ?? "application/octet-stream";
}
