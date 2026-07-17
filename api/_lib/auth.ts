type SameSiteMode = "lax" | "strict" | "none";

interface CookieOptions {
   expires?: Date;
   httpOnly?: boolean;
   secure?: boolean;
   sameSite?: SameSiteMode;
   maxAge?: number;
   path?: string;
}

export const OSIRIS_TOKEN_COOKIE_NAME = "osiris_bearer";
export const OSIRIS_TOKEN_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

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

   if (options.maxAge !== undefined) {
      segments.push(`Max-Age=${Math.floor(options.maxAge)}`);
   }

   if (options.expires) {
      segments.push(`Expires=${options.expires.toUTCString()}`);
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

export function buildOsirisTokenCookieHeader(value: string, isProduction: boolean): string {
   return serializeCookie(OSIRIS_TOKEN_COOKIE_NAME, value, {
      httpOnly: true,
      secure: isProduction,
      sameSite: "lax",
      path: "/",
      maxAge: OSIRIS_TOKEN_COOKIE_MAX_AGE_SECONDS,
   });
}

export function buildClearOsirisTokenCookieHeader(isProduction: boolean): string {
   return serializeCookie(OSIRIS_TOKEN_COOKIE_NAME, "", {
      httpOnly: true,
      secure: isProduction,
      sameSite: "lax",
      path: "/",
      maxAge: 0,
      expires: new Date(0),
   });
}
