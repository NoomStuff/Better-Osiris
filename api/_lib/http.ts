import type { IncomingMessage, ServerResponse } from "node:http";

export interface JsonResponseOptions {
   headers?: Record<string, string | string[]>;
}

export function sendJson(res: ServerResponse, statusCode: number, payload: unknown, options: JsonResponseOptions = {}) {
   res.statusCode = statusCode;
   Object.entries(options.headers ?? {}).forEach(([name, value]) => {
      res.setHeader(name, value);
   });
   res.setHeader("Content-Type", "application/json");
   res.end(JSON.stringify(payload));
}

export function sendMethodNotAllowed(res: ServerResponse, allowedMethods: readonly string[]) {
   res.statusCode = 405;
   res.setHeader("Allow", allowedMethods.join(", "));
   res.end("Method Not Allowed");
}

export async function readJsonBody<TPayload>(req: IncomingMessage): Promise<TPayload | null> {
   const chunks: Uint8Array[] = [];

   for await (const chunk of req) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
   }

   if (chunks.length === 0) {
      return null;
   }

   try {
      return JSON.parse(Buffer.concat(chunks).toString("utf8")) as TPayload;
   } catch {
      return null;
   }
}

export function getRequestUrl(req: IncomingMessage) {
   return new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
}

export function parseBoundedInt(value: string | null, fallback: number, min: number, max: number) {
   const parsed = value === null ? Number.NaN : Number.parseInt(value, 10);
   if (Number.isNaN(parsed)) {
      return fallback;
   }

   return Math.min(Math.max(parsed, min), max);
}
