import { iconSubset } from "./scripts/iconSubset.ts";
import { offlineShell } from "./scripts/offlineShell.ts";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
   const env = loadEnv(mode, process.cwd(), "");
   const schoolName = env["SCHOOL_NAME"]?.trim() ?? "";
   // Vercel preview deployments ship the dev tools so changes can be tested on a real device.
   const hasDevTools = mode === "development" || (env["VERCEL_ENV"] ?? process.env["VERCEL_ENV"]) === "preview";

   return {
      plugins: [iconSubset(), offlineShell()],
      define: {
         "import.meta.env.VITE_SCHOOL_NAME": JSON.stringify(schoolName),
         "import.meta.env.VITE_DEV_TOOLS": JSON.stringify(hasDevTools),
      },
      server: {
         proxy: {
            "/api": {
               target: "http://localhost:8787",
               changeOrigin: false,
            },
         },
      },
   };
});
