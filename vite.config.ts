import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
   const env = loadEnv(mode, process.cwd(), "");
   const schoolName = env["SCHOOL_NAME"]?.trim() ?? "";

   return {
      define: {
         "import.meta.env.VITE_SCHOOL_NAME": JSON.stringify(schoolName),
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
