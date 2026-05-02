import fs from "node:fs";
import path from "node:path";

export function getEnvValue(key: string): string | undefined {
   const existing = process.env[key];
   if (existing) {
      return existing;
   }

   for (const envFile of [".env", ".env.local", ".env.production", ".env.production.local"]) {
      const envPath = path.resolve(process.cwd(), envFile);
      if (!fs.existsSync(envPath)) {
         continue;
      }

      const envContents = fs.readFileSync(envPath, "utf8");
      const line = envContents.split(/\r?\n/).find((entry) => entry.trim().startsWith(`${key}=`));

      if (!line) {
         continue;
      }

      const rawValue = line.split("=", 2)[1]?.trim();
      if (!rawValue) {
         continue;
      }

      return rawValue.replace(/^"(.*)"$/, "$1").replace(/^'(.*)'$/, "$1");
   }

   return undefined;
}
