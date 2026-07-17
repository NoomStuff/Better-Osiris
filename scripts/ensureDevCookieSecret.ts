import { ensureDevelopmentCookieSecret } from "../api/_lib/devEnvironment.js";

try {
   if (await ensureDevelopmentCookieSecret()) {
      console.warn("Generated a secure development COOKIE_SECRET in .env.");
   }
} catch (error) {
   console.error(error instanceof Error ? error.message : error);
   process.exitCode = 1;
}
