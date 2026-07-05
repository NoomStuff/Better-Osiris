import { getEnvValue } from "./env.js";

export function getOsirisRosterUrl(): string {
   const configuredUrl = getEnvValue("OSIRIS_ROSTER_URL")?.trim();
   if (!configuredUrl) {
      throw new Error("OSIRIS_ROSTER_URL is required.");
   }

   return validateRosterUrl(configuredUrl);
}

function validateRosterUrl(value: string): string {
   let url: URL;

   try {
      url = new URL(value);
   } catch {
      throw new Error("OSIRIS_ROSTER_URL must be a valid absolute URL.");
   }

   if (url.protocol !== "https:" && url.protocol !== "http:") {
      throw new Error("OSIRIS_ROSTER_URL must use HTTP or HTTPS.");
   }

   return url.toString().replace(/\/$/, "");
}
