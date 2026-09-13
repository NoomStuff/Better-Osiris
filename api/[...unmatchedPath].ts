import type { IncomingMessage, ServerResponse } from "node:http";
import { sendApiNotFound } from "./_lib/http.js";

/**
 * Catch-all for unmatched API paths. Without it Vercel's SPA rewrite answers unknown /api/*
 * requests with index.html and status 200, which the client cannot parse as an API error.
 */
export default function handler(_req: IncomingMessage, res: ServerResponse) {
   sendApiNotFound(res);
}
