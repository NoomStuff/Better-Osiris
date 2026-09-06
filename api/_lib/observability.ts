import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";

/** Deliberately excludes query strings, headers, request bodies, payloads and error messages. */
export function observeApiRequest(req: IncomingMessage, res: ServerResponse, route: string) {
   const requestId = randomUUID();
   const started = performance.now();
   res.setHeader("X-Request-ID", requestId);
   res.once("finish", () => {
      if (res.statusCode < 400) return;
      console.warn(JSON.stringify({ requestId, route, method: req.method, status: res.statusCode, durationMs: Math.round(performance.now() - started) }));
   });
}
