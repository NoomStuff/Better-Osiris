import { buildClearOsirisTokenCookieHeader, buildOsirisTokenCookieHeader } from "./auth.js";
import { getEnvValue } from "./env.js";
import { getDefaultOsirisToken } from "./osirisToken.js";
import { createEncryptedOsirisTokenCookieValue, hasOsirisTokenCookie, readOsirisTokenFromCookie } from "./osirisTokenCookie.js";
import type { OsirisTokenSettings } from "../../shared/osirisTokenSettings.js";

export interface OsirisTokenSettingsResult {
   settings: OsirisTokenSettings;
   cookieHeader: string | null;
}

export class OsirisTokenSettingsError extends Error {
   readonly status: number;

   constructor(message: string, status: number) {
      super(message);
      this.name = "OsirisTokenSettingsError";
      this.status = status;
   }
}

export function getOsirisTokenSettings(cookieHeader: string | undefined): OsirisTokenSettingsResult {
   const cookieSecret = getEnvValue("COOKIE_SECRET");
   const hasCustomToken = cookieSecret ? hasValidOsirisTokenOverride(cookieHeader, cookieSecret) : false;

   if (hasCustomToken) {
      return {
         settings: { hasCustomToken: true, hasBearerToken: true },
         cookieHeader: null,
      };
   }

   const defaultTokenCookie = createDefaultTokenCookieHeader();
   if (defaultTokenCookie) {
      return {
         settings: { hasCustomToken: false, hasBearerToken: true },
         cookieHeader: defaultTokenCookie,
      };
   }

   return {
      settings: { hasCustomToken: false, hasBearerToken: Boolean(getDefaultOsirisToken()) },
      cookieHeader: null,
   };
}

export function saveOsirisTokenSetting(rawToken: unknown): OsirisTokenSettingsResult {
   const cookieSecret = getEnvValue("COOKIE_SECRET");
   if (!cookieSecret) {
      throw new OsirisTokenSettingsError("COOKIE_SECRET is required before a browser bearer token can be saved.", 500);
   }

   const token = typeof rawToken === "string" ? rawToken.trim() : "";
   if (!token) {
      throw new OsirisTokenSettingsError("Token is required.", 400);
   }

   return {
      settings: { hasCustomToken: true, hasBearerToken: true },
      cookieHeader: buildOsirisTokenCookieHeader(createEncryptedOsirisTokenCookieValue(token, cookieSecret), isProduction()),
   };
}

export function clearOsirisTokenSetting(): OsirisTokenSettingsResult {
   const defaultTokenCookie = createDefaultTokenCookieHeader();

   return {
      settings: {
         hasCustomToken: false,
         hasBearerToken: Boolean(getDefaultOsirisToken()),
      },
      cookieHeader: defaultTokenCookie ?? buildClearOsirisTokenCookieHeader(isProduction()),
   };
}

export function resolveOsirisBearerToken(cookieHeader: string | undefined): string | null {
   const cookieSecret = getEnvValue("COOKIE_SECRET");
   return (cookieSecret ? readOsirisTokenFromCookie(cookieHeader, cookieSecret) : null) ?? getDefaultOsirisToken();
}

function createDefaultTokenCookieHeader(): string | null {
   const cookieSecret = getEnvValue("COOKIE_SECRET");
   const defaultToken = getDefaultOsirisToken();

   if (!cookieSecret || !defaultToken) {
      return null;
   }

   return buildOsirisTokenCookieHeader(createEncryptedOsirisTokenCookieValue(defaultToken, cookieSecret), isProduction());
}

function hasValidOsirisTokenOverride(cookieHeader: string | undefined, secret: string): boolean {
   return hasOsirisTokenCookie(cookieHeader) && Boolean(readOsirisTokenFromCookie(cookieHeader, secret));
}

function isProduction() {
   return process.env["NODE_ENV"] === "production";
}
