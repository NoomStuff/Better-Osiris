import { getEnvValue } from "./env.js";
import { ApiError } from "./errors.js";

const MIN_COOKIE_SECRET_LENGTH = 32;
const TOKEN_MAX_LENGTH = 2_048;
const INSECURE_COOKIE_SECRETS = new Set(["replace-with-a-long-random-value", "replace-with-at-least-32-cryptographically-random-characters"]);

export function getOsirisRosterUrl(): string {
   const configuredUrl = getEnvValue("OSIRIS_ROSTER_URL")?.trim();
   if (!configuredUrl) {
      throw configurationError("OSIRIS_ROSTER_URL is required.");
   }

   return validateRosterUrl(configuredUrl);
}

function validateRosterUrl(value: string): string {
   let url: URL;

   try {
      url = new URL(value);
   } catch {
      throw configurationError("OSIRIS_ROSTER_URL must be a valid absolute URL.");
   }

   if (url.protocol !== "https:") {
      throw configurationError("OSIRIS_ROSTER_URL must use HTTPS.");
   }

   return url.toString().replace(/\/$/, "");
}

export function getCookieSecret() {
   const secret = getEnvValue("COOKIE_SECRET")?.trim();
   if (!isSecureCookieSecret(secret)) {
      throw configurationError(`COOKIE_SECRET must be a unique random value of at least ${MIN_COOKIE_SECRET_LENGTH} characters.`);
   }

   return secret;
}

export function isSecureCookieSecret(secret: string | undefined): secret is string {
   return Boolean(secret && secret.length >= MIN_COOKIE_SECRET_LENGTH && !INSECURE_COOKIE_SECRETS.has(secret));
}

export function normalizeBearerToken(rawToken: unknown, fieldName = "Token") {
   const token = typeof rawToken === "string" ? rawToken.trim() : "";
   if (!token) {
      throw new ApiError(`${fieldName} is required.`, { code: "INVALID_REQUEST", status: 400 });
   }

   if (!/^Bearer [^\s]+$/i.test(token)) {
      throw new ApiError(`${fieldName} must contain "Bearer " followed by a token without whitespace.`, { code: "INVALID_REQUEST", status: 400 });
   }

   if (token.length > TOKEN_MAX_LENGTH) {
      throw new ApiError(`${fieldName} is too long.`, { code: "INVALID_REQUEST", status: 400 });
   }

   return token;
}

export function getDefaultOsirisToken() {
   const rawToken = getEnvValue("BEARER_TOKEN")?.trim();
   if (!rawToken) {
      return null;
   }

   if (isProduction() && getEnvValue("ALLOW_SHARED_BEARER_TOKEN") !== "true") {
      throw configurationError("BEARER_TOKEN requires ALLOW_SHARED_BEARER_TOKEN=true in production.");
   }

   return normalizeBearerToken(rawToken, "BEARER_TOKEN");
}

export function validateServerConfiguration() {
   getCookieSecret();
   getOsirisRosterUrl();
   getDefaultOsirisToken();
}

export function isProduction() {
   return process.env["NODE_ENV"] === "production" || process.env["VERCEL_ENV"] === "production";
}

function configurationError(message: string) {
   return new ApiError(message, {
      code: "CONFIGURATION_ERROR",
      status: 500,
   });
}
