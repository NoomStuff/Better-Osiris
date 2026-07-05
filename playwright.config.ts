import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
   testDir: "./tests/e2e",
   testMatch: /.*\.e2e\.ts/,
   fullyParallel: true,
   reporter: "list",
   use: {
      baseURL: "http://127.0.0.1:5173",
      trace: "on-first-retry",
   },
   webServer: {
      command: "bunx vite --host 127.0.0.1",
      url: "http://127.0.0.1:5173",
      reuseExistingServer: !process.env["CI"],
      stdout: "ignore",
      stderr: "pipe",
      env: {
         ...process.env,
         SCHOOL_NAME: "",
      },
   },
   projects: [
      {
         name: "chromium",
         use: { ...devices["Desktop Chrome"] },
      },
   ],
});
