import type { IncomingMessage, ServerResponse } from "node:http";
import { ApiError } from "./errors.js";
import { applyPrivateResponseHeaders } from "./security.js";

const DEFAULT_MAX_JSON_BODY_BYTES = 8 * 1024;

export interface JsonResponseOptions {
   headers?: Record<string, string | string[]>;
}

export function sendJson(res: ServerResponse, statusCode: number, payload: unknown, options: JsonResponseOptions = {}) {
   res.statusCode = statusCode;
   applyPrivateResponseHeaders(res);
   Object.entries(options.headers ?? {}).forEach(([name, value]) => {
      res.setHeader(name, value);
   });
   res.setHeader("Content-Type", "application/json");
   res.end(JSON.stringify(payload));
}

export function sendMethodNotAllowed(res: ServerResponse, allowedMethods: readonly string[]) {
   res.statusCode = 405;
   applyPrivateResponseHeaders(res);
   res.setHeader("Allow", allowedMethods.join(", "));
   res.end("Method Not Allowed");
}

export async function readJsonBody(req: IncomingMessage, maxBytes = DEFAULT_MAX_JSON_BODY_BYTES): Promise<unknown> {
   const chunks: Uint8Array[] = [];
   let byteLength = 0;

   for await (const chunk of req) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      byteLength += buffer.byteLength;
      if (byteLength > maxBytes) {
         throw new ApiError("The request body is too large.", {
            code: "PAYLOAD_TOO_LARGE",
            status: 413,
         });
      }
      chunks.push(buffer);
   }

   if (chunks.length === 0) {
      return null;
   }

   try {
      return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
   } catch {
      throw new ApiError("The request body must be valid JSON.", {
         code: "INVALID_REQUEST",
         status: 400,
      });
   }
}

export function getRequestUrl(req: IncomingMessage) {
   return new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
}
