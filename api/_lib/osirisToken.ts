import { getEnvValue } from "./env.js";

export function getDefaultOsirisToken(): string | null {
   const token = getEnvValue("BEARER_TOKEN")?.trim();
   if (!token) {
      return null;
   }

   return token;
}
