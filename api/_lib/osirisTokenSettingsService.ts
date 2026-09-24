import { buildClearOsirisTokenCookieHeader, buildOsirisTokenCookieHeader } from "./auth.js";
import { readOsirisTokenFromCookie, createEncryptedOsirisTokenCookieValue } from "./osirisTokenCookie.js";
import { ApiError } from "./errors.js";
import { getCookieSecret, getDefaultOsirisToken, isProduction, normalizeBearerToken } from "./osirisConfig.js";
import type { OsirisTokenSettings } from "../../shared/weeks.js";
import { getCredentialContext } from "./credentialContext.js";

export interface OsirisTokenSettingsResult {
   settings: OsirisTokenSettings;
   cookieHeader: string | null;
}

export function getOsirisTokenSettings(cookieHeader: string | undefined): OsirisTokenSettingsResult {
   const token = readOsirisTokenFromCookie(cookieHeader, getCookieSecret());

   if (token) {
      return {
         settings: { hasCustomToken: true, hasBearerToken: true, contextId: getCredentialContext(token) },
         cookieHeader: null,
      };
   }

   return {
      settings: { hasCustomToken: false, hasBearerToken: Boolean(getDefaultOsirisToken()), contextId: getCredentialContext(getDefaultOsirisToken()) },
      cookieHeader: null,
   };
}

export function saveOsirisTokenSetting(rawToken: unknown): OsirisTokenSettingsResult {
   const cookieSecret = getCookieSecret();
   const token = normalizeBearerToken(rawToken);

   return {
      settings: { hasCustomToken: true, hasBearerToken: true, contextId: getCredentialContext(token) },
      cookieHeader: buildOsirisTokenCookieHeader(createEncryptedOsirisTokenCookieValue(token, cookieSecret), isProduction()),
   };
}

export function clearOsirisTokenSetting(): OsirisTokenSettingsResult {
   return {
      settings: {
         hasCustomToken: false,
         hasBearerToken: Boolean(getDefaultOsirisToken()),
         contextId: getCredentialContext(getDefaultOsirisToken()),
      },
      cookieHeader: buildClearOsirisTokenCookieHeader(isProduction()),
   };
}

export function resolveOsirisBearerToken(cookieHeader: string | undefined): { token: string | null; fromCookie: boolean } {
   const cookieSecret = getCookieSecret();
   const cookieToken = readOsirisTokenFromCookie(cookieHeader, cookieSecret);
   if (cookieToken) {
      try {
         return { token: normalizeBearerToken(cookieToken), fromCookie: true };
      } catch {
         throw new ApiError("The saved bearer token is invalid.", {
            code: "AUTH_REQUIRED",
            status: 401,
         });
      }
   }

   return { token: getDefaultOsirisToken(), fromCookie: false };
}
