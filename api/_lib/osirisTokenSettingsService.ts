import { buildClearOsirisTokenCookieHeader, buildOsirisTokenCookieHeader } from "./auth.js";
import { createEncryptedOsirisTokenCookieValue, hasOsirisTokenCookie, readOsirisTokenFromCookie } from "./osirisTokenCookie.js";
import { ApiError } from "./errors.js";
import { getCookieSecret, getDefaultOsirisToken, isProduction, normalizeBearerToken } from "./osirisConfig.js";
import type { OsirisTokenSettings } from "../../shared/roster.js";

export interface OsirisTokenSettingsResult {
   settings: OsirisTokenSettings;
   cookieHeader: string | null;
}

export function getOsirisTokenSettings(cookieHeader: string | undefined): OsirisTokenSettingsResult {
   const cookieSecret = getCookieSecret();
   const hasCustomToken = hasValidOsirisTokenOverride(cookieHeader, cookieSecret);

   if (hasCustomToken) {
      return {
         settings: { hasCustomToken: true, hasBearerToken: true },
         cookieHeader: null,
      };
   }

   return {
      settings: { hasCustomToken: false, hasBearerToken: Boolean(getDefaultOsirisToken()) },
      cookieHeader: null,
   };
}

export function saveOsirisTokenSetting(rawToken: unknown): OsirisTokenSettingsResult {
   const cookieSecret = getCookieSecret();
   const token = normalizeBearerToken(rawToken);

   return {
      settings: { hasCustomToken: true, hasBearerToken: true },
      cookieHeader: buildOsirisTokenCookieHeader(createEncryptedOsirisTokenCookieValue(token, cookieSecret), isProduction()),
   };
}

export function clearOsirisTokenSetting(): OsirisTokenSettingsResult {
   return {
      settings: {
         hasCustomToken: false,
         hasBearerToken: Boolean(getDefaultOsirisToken()),
      },
      cookieHeader: buildClearOsirisTokenCookieHeader(isProduction()),
   };
}

export function resolveOsirisBearerToken(cookieHeader: string | undefined): string | null {
   const cookieSecret = getCookieSecret();
   const cookieToken = readOsirisTokenFromCookie(cookieHeader, cookieSecret);
   if (cookieToken) {
      try {
         return normalizeBearerToken(cookieToken);
      } catch {
         throw new ApiError("The saved bearer token is invalid.", {
            code: "AUTH_REQUIRED",
            status: 401,
         });
      }
   }

   return getDefaultOsirisToken();
}

function hasValidOsirisTokenOverride(cookieHeader: string | undefined, secret: string): boolean {
   return hasOsirisTokenCookie(cookieHeader) && Boolean(readOsirisTokenFromCookie(cookieHeader, secret));
}
