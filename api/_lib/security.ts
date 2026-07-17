import type { IncomingMessage, ServerResponse } from "node:http";
import { ApiError } from "./errors.js";

export const PRIVATE_RESPONSE_HEADERS = {
   "Cache-Control": "private, no-store, max-age=0",
   Pragma: "no-cache",
   Vary: "Cookie",
   "X-Content-Type-Options": "nosniff",
   "Referrer-Policy": "no-referrer",
   "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
} as const;

export const CONTENT_SECURITY_POLICY = [
   "default-src 'self'",
   "base-uri 'self'",
   "connect-src 'self'",
   "font-src 'self'",
   "form-action 'self'",
   "frame-ancestors 'none'",
   "img-src 'self' data:",
   "object-src 'none'",
   "script-src 'self'",
   "style-src 'self' 'unsafe-inline'",
].join("; ");

export function applyPrivateResponseHeaders(res: ServerResponse) {
   Object.entries(PRIVATE_RESPONSE_HEADERS).forEach(([name, value]) => res.setHeader(name, value));
}

export function assertSameOrigin(req: IncomingMessage) {
   const origin = req.headers.origin;
   if (!origin) {
      return;
   }

   const forwardedProto = getFirstHeaderValue(req.headers["x-forwarded-proto"]);
   const host = req.headers.host;
   if (!host) {
      throw invalidOriginError();
   }

   try {
      const expectedOrigin = new URL(`${forwardedProto ?? "http"}://${host}`).origin;
      if (new URL(origin).origin === expectedOrigin) {
         return;
      }
   } catch {
      // Invalid origins are rejected below.
   }

   throw invalidOriginError();
}

function getFirstHeaderValue(value: string | string[] | undefined) {
   const firstValue = Array.isArray(value) ? value[0] : value;
   return firstValue?.split(",")[0]?.trim();
}

function invalidOriginError() {
   return new ApiError("The request origin is not allowed.", {
      code: "INVALID_REQUEST",
      status: 403,
   });
}
