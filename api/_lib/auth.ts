import crypto from "node:crypto";

type SameSiteMode = "lax" | "strict" | "none";

interface CookieOptions {
   httpOnly?: boolean;
   secure?: boolean;
   sameSite?: SameSiteMode;
   maxAge?: number;
   path?: string;
}

export const AUTH_COOKIE_NAME = "auth";
export const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

export function createSignedAuthCookieValue(secret: string): string {
   const value = base64UrlEncode(crypto.randomBytes(18));
   const signature = signValue(value, secret);
   return `${value}.${signature}`;
}

export function isValidAuthCookieValue(cookieValue: string, secret: string): boolean {
   const [value, signature] = cookieValue.split(".");

   if (!value || !signature) {
      return false;
   }

   const expectedSignature = signValue(value, secret);

   if (signature.length !== expectedSignature.length) {
      return false;
   }

   return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature));
}

export function parseCookie(header: string | undefined, name: string): string | null {
   if (!header) {
      return null;
   }

   const parts = header.split(";");
   for (const part of parts) {
      const trimmed = part.trim();
      if (!trimmed) {
         continue;
      }

      const separatorIndex = trimmed.indexOf("=");
      if (separatorIndex === -1) {
         continue;
      }

      const cookieName = trimmed.slice(0, separatorIndex).trim();
      if (cookieName !== name) {
         continue;
      }

      return trimmed.slice(separatorIndex + 1);
   }

   return null;
}

export function serializeCookie(name: string, value: string, options: CookieOptions = {}): string {
   const segments = [`${name}=${encodeURIComponent(value)}`];

   if (options.maxAge) {
      segments.push(`Max-Age=${Math.floor(options.maxAge)}`);
   }

   if (options.path) {
      segments.push(`Path=${options.path}`);
   }

   if (options.sameSite) {
      segments.push(`SameSite=${options.sameSite}`);
   }

   if (options.httpOnly) {
      segments.push("HttpOnly");
   }

   if (options.secure) {
      segments.push("Secure");
   }

   return segments.join("; ");
}

export function buildAuthCookieHeader(value: string, isProduction: boolean): string {
   return serializeCookie(AUTH_COOKIE_NAME, value, {
      httpOnly: true,
      secure: isProduction,
      sameSite: "lax",
      path: "/",
      maxAge: COOKIE_MAX_AGE_SECONDS,
   });
}

function signValue(value: string, secret: string): string {
   return base64UrlEncode(crypto.createHmac("sha256", secret).update(value).digest());
}

function base64UrlEncode(buffer: Buffer | Uint8Array): string {
   return Buffer.from(buffer).toString("base64url");
}
