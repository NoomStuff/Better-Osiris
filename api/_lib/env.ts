import fs from "node:fs";
import path from "node:path";

let fileEnvironment: ReadonlyMap<string, string> | null = null;

export function getEnvValue(key: string): string | undefined {
   if (Object.hasOwn(process.env, key)) {
      const existing = process.env[key];
      return existing === "" ? undefined : existing;
   }

   fileEnvironment ??= loadEnvironmentFiles();
   return fileEnvironment.get(key);
}

export function clearEnvironmentFileCache() {
   fileEnvironment = null;
}

export function loadEnvironmentFiles(directory = process.cwd(), mode = process.env["NODE_ENV"]?.trim()) {
   const values = new Map<string, string>();
   const envFiles = mode ? [`.env.${mode}.local`, `.env.${mode}`, ".env.local", ".env"] : [".env.local", ".env"];

   for (const envFile of envFiles) {
      const envPath = path.resolve(directory, envFile);
      if (!fs.existsSync(envPath)) {
         continue;
      }

      const envContents = fs.readFileSync(envPath, "utf8");
      envContents.split(/\r?\n/).forEach((entry) => {
         const line = entry.trim();
         if (!line || line.startsWith("#")) {
            return;
         }

         const separatorIndex = line.indexOf("=");
         if (separatorIndex <= 0) {
            return;
         }

         const key = line.slice(0, separatorIndex).trim();
         const rawValue = line.slice(separatorIndex + 1).trim();
         if (!key || !rawValue || values.has(key)) {
            return;
         }

         values.set(key, rawValue.replace(/^"(.*)"$/, "$1").replace(/^'(.*)'$/, "$1"));
      });
   }

   return values;
}
